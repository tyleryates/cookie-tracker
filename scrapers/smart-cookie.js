const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const fs = require('fs');
const path = require('path');
const { getTimestamp } = require('../scraper-utils');

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
   */
  async login(username, password) {
    this.sendProgress('Smart Cookie API: Logging in...', 20);

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

      if (response.status !== 200) {
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

      this.sendProgress('Smart Cookie API: Login successful', 30);
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

      if (response.status !== 200) {
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
   * Save orders data to JSON file
   */
  async saveOrdersData(ordersData) {
    this.sendProgress('Smart Cookie API: Saving data...', 80);

    // Ensure output directory exists
    if (!fs.existsSync(this.inDir)) {
      fs.mkdirSync(this.inDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = getTimestamp();
    const filePath = path.join(this.inDir, `SC-${timestamp}.json`);

    // Write JSON file with pretty formatting
    fs.writeFileSync(filePath, JSON.stringify(ordersData, null, 2));

    this.sendProgress('Smart Cookie API: Data saved', 90);

    return filePath;
  }

  /**
   * Main scraping method
   * Orchestrates the login, fetch, and save operations
   */
  async scrape(credentials) {
    try {
      this.sendProgress('Smart Cookie API: Starting...', 10);

      // Step 1: Login and get auth cookies
      await this.login(credentials.username, credentials.password);

      // Step 2: Fetch orders data
      const ordersData = await this.fetchOrders();

      // Step 3: Save to file
      const filePath = await this.saveOrdersData(ordersData);

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
