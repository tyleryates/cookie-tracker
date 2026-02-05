const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { getTimestamp } = require('../scraper-utils');

/**
 * Digital Cookie Scraper - API-based scraping
 */
class DigitalCookieScraper {
  constructor(dataDir, progressCallback = null) {
    this.dataDir = dataDir;
    this.inDir = path.join(dataDir, 'in');
    this.progressCallback = progressCallback;

    // Create axios client with cookie jar support
    const jar = new CookieJar();
    this.client = wrapper(axios.create({
      baseURL: 'https://digitalcookie.girlscouts.org',
      jar: jar,
      withCredentials: true,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
   * Extract CSRF token from login page
   */
  extractCSRFToken(html) {
    const $ = cheerio.load(html);
    const token = $('input[name="_requestConfirmationToken"]').val();
    if (!token) {
      throw new Error('CSRF token not found in login page');
    }
    return token;
  }

  /**
   * Extract role ID from role selection page
   * If roleName is empty/not provided, auto-selects first role starting with "Troop"
   * Returns { roleId, selectedRoleName }
   */
  extractRoleId(html, roleName) {
    const $ = cheerio.load(html);
    let roleId = null;
    let selectedRoleName = null;
    const availableRoles = [];

    $('.custom-dropdown-option').each((i, elem) => {
      const optionText = $(elem).text().trim();
      const optionValue = $(elem).attr('data-value');
      availableRoles.push({ value: optionValue, text: optionText });

      // If specific role name provided, match exactly
      if (roleName && optionText === roleName) {
        roleId = optionValue;
        selectedRoleName = optionText;
        return false; // Break loop
      }

      // If no role specified, auto-select first role starting with "Troop"
      if (!roleName && roleId === null && optionText.startsWith('Troop')) {
        roleId = optionValue;
        selectedRoleName = optionText;
        return false; // Break loop
      }
    });

    if (roleId === null) {
      const rolesList = availableRoles.map(r => `  [${r.value}] "${r.text}"`).join('\n');
      if (roleName) {
        throw new Error(`Role "${roleName}" not found.\n\nAvailable roles:\n${rolesList}`);
      } else {
        throw new Error(`No role starting with "Troop" found.\n\nAvailable roles:\n${rolesList}`);
      }
    }

    return { roleId, selectedRoleName };
  }

  /**
   * Extract troop and service unit IDs from role name
   */
  extractTroopInfo(roleName) {
    const troopMatch = roleName.match(/Troop\s+(\d+)/i);
    const serviceUnitMatch = roleName.match(/Service\s+Unit\s+(\d+)/i);

    if (!troopMatch || !serviceUnitMatch) {
      throw new Error(`Cannot extract troop/service unit IDs from role: "${roleName}"`);
    }

    return {
      troopId: troopMatch[1],
      serviceUnitId: serviceUnitMatch[1]
    };
  }

  /**
   * Login to Digital Cookie
   */
  async login(username, password, roleName) {
    this.sendProgress('Digital Cookie: Getting CSRF token...', 10);

    // Get CSRF token
    const loginPageResponse = await this.client.get('/login');
    const csrfToken = this.extractCSRFToken(loginPageResponse.data);

    this.sendProgress('Digital Cookie: Logging in...', 20);

    // Submit login
    const params = new URLSearchParams({
      j_username: username,
      j_password: password,
      _requestConfirmationToken: csrfToken
    });

    const loginResponse = await this.client.post(
      '/j_spring_security_check',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (loginResponse.status !== 200 && loginResponse.status !== 302) {
      throw new Error(`Login failed with status ${loginResponse.status}`);
    }

    this.sendProgress('Digital Cookie: Selecting role...', 25);

    // Get and select role
    const rolePageResponse = await this.client.get('/select-role');
    const { roleId, selectedRoleName } = this.extractRoleId(rolePageResponse.data, roleName);

    const roleResponse = await this.client.get(`/select-role?id=${roleId}`);

    if (roleResponse.status !== 200 && roleResponse.status !== 302) {
      throw new Error(`Role selection failed with status ${roleResponse.status}`);
    }

    this.sendProgress('Digital Cookie: Login successful', 30);

    // Store the selected role name for use in downloadExport
    this.selectedRoleName = selectedRoleName;
    return true;
  }

  /**
   * Download export file
   */
  async downloadExport(councilId = '623') {
    this.sendProgress('Digital Cookie: Preparing export...', 40);

    // Use the role name that was selected during login
    const { troopId, serviceUnitId } = this.extractTroopInfo(this.selectedRoleName);

    this.sendProgress('Digital Cookie: Generating report...', 50);

    // Generate report
    const generateResponse = await this.client.get('/ajaxCall/generateReport', {
      params: {
        reportType: 'TROOP_ORDER_REPORT',
        troopId: troopId,
        serviceUnitId: serviceUnitId,
        councilId: councilId
      }
    });

    const result = generateResponse.data;
    if (result.errorCode !== '0') {
      throw new Error(`Report generation failed: ${result.errorMessage}`);
    }

    const responseData = JSON.parse(result.responseData);
    const fileName = responseData.fileName;

    if (!fileName || responseData.statusCode !== 'Success') {
      throw new Error('Report generation did not return a valid file name');
    }

    this.sendProgress('Digital Cookie: Downloading file...', 60);

    // Download file
    const downloadResponse = await this.client.get(
      `/ajaxCall/downloadFile/TROOP_ORDER_REPORT/${fileName}`,
      { responseType: 'arraybuffer' }
    );

    // Save file
    const timestamp = getTimestamp();
    const filePath = path.join(this.inDir, `DC-${timestamp}.xlsx`);

    if (!fs.existsSync(this.inDir)) {
      fs.mkdirSync(this.inDir, { recursive: true });
    }

    fs.writeFileSync(filePath, downloadResponse.data);

    this.sendProgress('Digital Cookie: Export complete', 70);

    return filePath;
  }

  /**
   * Main scraping method
   */
  async scrape(credentials) {
    try {
      await this.login(
        credentials.username,
        credentials.password,
        credentials.role || '' // Empty string = auto-select first Troop role
      );

      const councilId = credentials.councilId || '623';
      const filePath = await this.downloadExport(councilId);

      return {
        success: true,
        source: 'Digital Cookie',
        filePath: filePath
      };
    } catch (error) {
      return {
        success: false,
        source: 'Digital Cookie',
        error: error.message
      };
    }
  }
}

module.exports = DigitalCookieScraper;
