const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const fs = require('fs');
const path = require('path');
const { getTimestamp } = require('../scraper-utils');
const { requestWithRetry } = require('./request-utils');
const { HTTP_STATUS } = require('../constants');

/**
 * Smart Cookie API Scraper - API-based scraping
 *
 * This scraper uses the Smart Cookies API endpoints directly to:
 * 1. Login and obtain authentication cookies (AuthCookie and XSRF-TOKEN)
 * 2. Call the orders search API with proper CSRF protection
 * 3. Save the JSON response to disk
 */
class SmartCookieApiScraper {
  constructor(dataDir, progressCallback = null) {
    this.dataDir = dataDir;
    this.inDir = path.join(dataDir, 'in');
    this.progressCallback = progressCallback;
    this.xsrfToken = null;

    // Create axios client with cookie jar support
    // This automatically handles cookies like a browser would
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({
      baseURL: 'https://app.abcsmartcookies.com',
      jar: this.jar,
      withCredentials: true,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }));
  }

  sendProgress(status, progress) {
    if (this.progressCallback) {
      this.progressCallback({ status, progress });
    }
  }

  /**
   * Extract XSRF token from cookies
   * The XSRF-TOKEN cookie value needs to be sent in the x-xsrf-token header
   */
  async extractXsrfToken() {
    try {
      // Get all cookies as a string to see the raw Set-Cookie header
      const cookies = await this.jar.getCookies('https://app.abcsmartcookies.com');
      const xsrfCookie = cookies.find(cookie => cookie.key === 'XSRF-TOKEN');

      if (!xsrfCookie) {
        throw new Error('XSRF-TOKEN cookie not found after login');
      }

      // Use the raw cookie value
      this.xsrfToken = xsrfCookie.value;

      // URL decode if it contains %7C (encoded pipe character)
      // The token format is: part1|part2 where | is URL-encoded as %7C
      if (this.xsrfToken.includes('%7C')) {
        this.xsrfToken = decodeURIComponent(this.xsrfToken);
      }

      return this.xsrfToken;
    } catch (error) {
      throw new Error(`Failed to extract XSRF token: ${error.message}`);
    }
  }

  /**
   * Login to Smart Cookies
   * POSTs credentials to /webapi/api/account/login
   * Captures AuthCookie and XSRF-TOKEN from response cookies
   * @param {boolean} silent - If true, skip progress updates (for re-login during retry)
   */
  async login(username, password, silent = false) {
    if (!silent) {
      this.sendProgress('Smart Cookie API: Logging in...', 20);
    }

    try {
      // Note: The postData in the recording shows unquoted property names
      // But axios will send proper JSON with quoted keys
      const loginPayload = {
        username: username,
        password: password
      };

      const response = await this.client.post('/webapi/api/account/login', loginPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`Login failed with status ${response.status}`);
      }

      // Extract XSRF token from cookies for subsequent requests
      await this.extractXsrfToken();

      // Call /me endpoint to establish session (this is what the browser does after login)
      try {
        await this.client.get('/webapi/api/me', {
          headers: {
            'x-xsrf-token': this.xsrfToken,
            'Referer': 'https://app.abcsmartcookies.com/'
          }
        });

        // Refresh XSRF token after /me call
        await this.extractXsrfToken();
      } catch (err) {
        console.warn('Warning: /me endpoint failed:', err.message);
      }

      if (!silent) {
        this.sendProgress('Smart Cookie API: Login successful', 30);
      }
      return true;
    } catch (error) {
      if (error.response) {
        throw new Error(`Login failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Initialize orders page context by calling dashboard API
   * This establishes the session context needed for orders/search
   */
  async initializeOrdersContext() {
    try {
      // Call the orders dashboard API first
      await this.client.get('/webapi/api/orders/dashboard', {
        headers: {
          'x-xsrf-token': this.xsrfToken,
          'Referer': 'https://app.abcsmartcookies.com/'
        }
      });

      // Refresh XSRF token in case it changed
      await this.extractXsrfToken();

    } catch (error) {
      console.warn('Warning: Could not initialize orders context:', error.message);
      // Don't fail here, continue anyway
    }
  }

  /**
   * Fetch orders using the search API
   * POSTs search parameters to /webapi/api/orders/search
   * Includes x-xsrf-token header for CSRF protection
   */
  async fetchOrders() {
    this.sendProgress('Smart Cookie API: Fetching orders...', 50);

    // Initialize orders page context first
    await this.initializeOrdersContext();

    if (!this.xsrfToken) {
      throw new Error('XSRF token not available. Must login first.');
    }

    try {
      // Search parameters from the network recording
      // This searches for ALL order types and transfers
      const searchPayload = {
        transfer_types: ["ALL"],
        transaction_types: ["T", "C", "G"],
        types: ["ALL"],
        organization: {
          district: [],
          cupboard: [],
          service_unit: [],
          troop: []
        },
        user: {
          girl: []
        }
      };

      const response = await this.client.post('/webapi/api/orders/search', searchPayload, {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'x-xsrf-token': this.xsrfToken,
          'Referer': 'https://app.abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`Orders fetch failed with status ${response.status}`);
      }

      const ordersData = response.data;

      this.sendProgress('Smart Cookie API: Orders fetched', 70);
      return ordersData;
    } catch (error) {
      if (error.response) {
        console.error('Orders API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data
        });
        throw new Error(`Orders fetch failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`Orders fetch failed: ${error.message}`);
    }
  }

  /**
   * Fetch Smart Direct Ship Divider allocations
   * Shows how troop direct ship orders are allocated to individual scouts
   */
  async fetchDirectShipDivider() {
    this.sendProgress('Smart Cookie API: Fetching direct ship allocations...', 72);

    if (!this.xsrfToken) {
      throw new Error('XSRF token not available. Must login first.');
    }

    try {
      const response = await this.client.get('/webapi/api/troops/directship/smart-directship-divider', {
        headers: {
          'x-xsrf-token': this.xsrfToken,
          'Referer': 'https://app.abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`Direct ship divider fetch failed with status ${response.status}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Direct ship divider fetch failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`Direct ship divider fetch failed: ${error.message}`);
    }
  }

  /**
   * Fetch Virtual Cookie Share details for a specific order
   * Returns per-scout allocation breakdown
   */
  async fetchVirtualCookieShare(orderId) {
    if (!this.xsrfToken) {
      throw new Error('XSRF token not available. Must login first.');
    }

    try {
      const response = await this.client.get(`/webapi/api/cookie-shares/virtual/${orderId}`, {
        headers: {
          'x-xsrf-token': this.xsrfToken,
          'Referer': 'https://app.abcsmartcookies.com/'
        }
      });

      if (response.status !== HTTP_STATUS.OK) {
        throw new Error(`Virtual cookie share fetch failed with status ${response.status}`);
      }

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`Virtual cookie share fetch failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`Virtual cookie share fetch failed: ${error.message}`);
    }
  }

  /**
   * Fetch all Virtual Cookie Share allocations
   * Finds all COOKIE_SHARE transfers and fetches their per-scout breakdowns
   */
  async fetchAllVirtualCookieShares(ordersData) {
    this.sendProgress('Smart Cookie API: Fetching virtual cookie share details...', 75);

    const virtualCookieShares = [];

    // Find all COOKIE_SHARE transfers that aren't from Digital Cookie
    const cookieShareOrders = (ordersData.orders || []).filter(order => {
      const type = order.transfer_type || order.type || '';
      const orderNum = String(order.order_number || '');
      // COOKIE_SHARE type and order number doesn't start with 'D' (not from DC)
      return type.includes('COOKIE_SHARE') && !orderNum.startsWith('D');
    });

    // Fetch details for each COOKIE_SHARE order
    for (const order of cookieShareOrders) {
      const orderId = order.id || order.order_id;
      if (orderId) {
        try {
          const details = await this.fetchVirtualCookieShare(orderId);
          virtualCookieShares.push(details);
        } catch (error) {
          console.warn(`Warning: Could not fetch virtual cookie share ${orderId}:`, error.message);
        }
      }
    }

    return virtualCookieShares;
  }

  /**
   * Save orders data to JSON file
   */
  async saveOrdersData(ordersData, directShipDivider, virtualCookieShares) {
    this.sendProgress('Smart Cookie API: Saving data...', 80);

    // Ensure output directory exists
    if (!fs.existsSync(this.inDir)) {
      fs.mkdirSync(this.inDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = getTimestamp();
    const filePath = path.join(this.inDir, `SC-${timestamp}.json`);

    // Combine orders, direct ship divider, and virtual cookie share data
    const combinedData = {
      ...ordersData,
      directShipDivider: directShipDivider || null,
      virtualCookieShares: virtualCookieShares || []
    };

    // Write JSON file with pretty formatting
    fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2));

    this.sendProgress('Smart Cookie API: Data saved', 90);

    return filePath;
  }

  /**
   * Main scraping method
   * Orchestrates the login, fetch, and save operations
   * Uses automatic session detection - tries fetching first, only logs in if session expired
   */
  async scrape(credentials) {
    // Validate input
    if (!credentials || !credentials.username || !credentials.password) {
      return {
        success: false,
        source: 'Smart Cookie',
        error: 'Username and password are required'
      };
    }

    try {
      this.sendProgress('Smart Cookie API: Starting...', 10);

      // Store credentials for potential re-login
      this.credentials = credentials;

      // Smart Cookie requires login first to get XSRF token
      await this.login(credentials.username, credentials.password);

      // Step 1: Fetch orders with automatic retry if session expires
      const ordersData = await requestWithRetry(
        () => this.fetchOrders(),
        () => this.login(credentials.username, credentials.password, true),
        { logPrefix: 'Smart Cookie: Fetch Orders', rateLimit: false }
      );

      // Step 2: Fetch direct ship divider allocations (with rate limiting)
      const directShipDivider = await requestWithRetry(
        () => this.fetchDirectShipDivider(),
        () => this.login(credentials.username, credentials.password, true),
        { logPrefix: 'Smart Cookie: Fetch Direct Ship' }
      );

      // Step 3: Fetch virtual cookie share allocations (with rate limiting)
      const virtualCookieShares = await requestWithRetry(
        () => this.fetchAllVirtualCookieShares(ordersData),
        () => this.login(credentials.username, credentials.password, true),
        { logPrefix: 'Smart Cookie: Fetch Cookie Shares' }
      );

      // Step 4: Save to file
      const filePath = await this.saveOrdersData(ordersData, directShipDivider, virtualCookieShares);

      this.sendProgress('Smart Cookie API: Complete', 100);

      return {
        success: true,
        source: 'Smart Cookie API',
        filePath: filePath,
        orderCount: ordersData.orders?.length || 0,
        totalCases: ordersData.summary?.total_cases || 0
      };
    } catch (error) {
      console.error('Smart Cookie API scraper error:', error);
      return {
        success: false,
        source: 'Smart Cookie API',
        error: error.message
      };
    }
  }
}

module.exports = SmartCookieApiScraper;
