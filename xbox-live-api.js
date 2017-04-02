'use strict';

let cookie_parser = require('cookie');
let querystring = require('querystring');
let request = require('request');

module.exports = class XboxLiveApi {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.xuids = {};
    this.authStore = {
      notAfter: '',
      requestHeader: ''
    };
  }

  getClipsForGamerRequest(gamertag, callback) {
    if (this.authStore.notAfter) {
      let notAfterStamp = Math.floor(new Date(this.authStore.notAfter).getTime() / 1000);
      if (notAfterStamp - 1000 < Math.floor(Date.now() / 1000)) {
        this.authStore.notAfter = '';
      }
    }
    if (!this.authStore.notAfter) {
      this.authStore.requestHeader = '';
    }

    if (this.authStore.requestHeader) {
      return this.afterRequestHeader(gamertag, callback, this.authStore.requestHeader);
    } else {
      return this.fetchRequestHeader(gamertag, callback);
    }
  }

  processCookieHeader(cookieHeader) {
    let cookies = '';
    cookieHeader.forEach((cookieString, i) => {
      let parsedCookie = cookie_parser.parse(cookieString);
      let keys = Object.keys(parsedCookie);
      let key = keys[0];
      cookies += key + '=' + parsedCookie[key];
      if (i < cookieHeader.length - 1) {
        cookies += '; ';
      }
    });
    return cookies;
  }

  fetchRequestHeader(gamertag, callback) {
    let preAuthUrl = {
      uri: 'https://login.live.com'
      + '/oauth20_authorize.srf'
      + '?client_id=0000000048093EE3'
      + '&redirect_uri=https://login.live.com/oauth20_desktop.srf'
      + '&response_type=token'
      + '&display=touch'
      + '&scope=service::user.auth.xboxlive.com::MBI_SSL'
      + '&locale=en'
    };

    return request(preAuthUrl, (error, response, body) => {
      if (response && body) {
        let accessCookie = this.processCookieHeader(response.headers['set-cookie'] || []);

        let urlPost = '',
          ppftRe = '';
        try {
          urlPost = body.match(/urlPost:'([A-Za-z0-9:\?_\-\.&\\/=]+)/)[1];
          ppftRe = body.match(/sFTTag:'.*value=\"(.*)\"\/>'/)[1];
        } catch (e) { }

        if (accessCookie && ppftRe && urlPost) {
          return this.fetchAccessToken(gamertag, callback, accessCookie, urlPost, ppftRe);
        } else {
          return this.afterRequestHeader(gamertag, callback);
        }
      } else {
        return this.afterRequestHeader(gamertag, callback);
      }
    });
  }

  fetchAccessToken(gamertag, callback, accessCookie, urlPost, ppftRe) {
    let post_vals = {
      'login': this.username,
      'passwd': this.password,
      'PPFT': ppftRe,
      'PPSX': 'Passpor',
      'SI': 'Sign In',
      'type': '11',
      'NewUser': '1',
      'LoginOptions': '1',
      'i3': '36728',
      'm1': '768',
      'm2': '1184',
      'm3': '0',
      'i12': '1',
      'i17': '0',
      'i18': '__Login_Host|1'
    };
    let post_vals_qs = querystring.stringify(post_vals);

    let accessTokenRequestOptions = {
      method: 'POST',
      form: post_vals_qs,
      uri: urlPost,
      headers: {
        'Cookie': accessCookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(post_vals_qs, 'utf8'),
      }
    };

    return request(accessTokenRequestOptions, (error, response, body) => {
      if (response) {
        let cookie = this.processCookieHeader(response.headers['set-cookie'] || []);

        let accessToken = '';
        try {
          accessToken = response.headers.location.match(/access_token=(.+?)&/)[1];
        } catch (e) { }

        if (cookie && accessToken) {
          return this.fetchAuthenticate(gamertag, callback, cookie, accessToken);
        } else {
          return this.afterRequestHeader(gamertag, callback);
        }
      } else {
        return this.afterRequestHeader(gamertag, callback);
      }
    });
  }

  fetchAuthenticate(gamertag, callback, cookie, accessToken) {
    let payload = JSON.stringify({
      'RelyingParty': 'http://auth.xboxlive.com',
      'TokenType': 'JWT',
      'Properties': {
        'AuthMethod': 'RPS',
        'SiteName': 'user.auth.xboxlive.com',
        'RpsTicket': accessToken
      }
    });

    let authenticateRequestOptions = {
      uri: 'https://user.auth.xboxlive.com/user/authenticate',
      method: 'POST',
      body: payload,
      headers: {
        'Cookie': cookie,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload, 'utf8')
      }
    };

    return request(authenticateRequestOptions, (error, response, body) => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body);
      } catch (e) { }

      if (cookie && parsedBody) {
        try {
          this.authStore.notAfter = parsedBody.NotAfter;
        } catch (e) { }

        let token = '';
        try {
          token = parsedBody.Token;
        } catch (e) { }

        if (token) {
          return this.fetchAuthorize(gamertag, callback, cookie, token);
        } else {
          return this.afterRequestHeader(gamertag, callback);
        }
      } else {
        return this.afterRequestHeader(gamertag, callback);
      }
    });
  }

  fetchAuthorize(gamertag, callback, cookie, token) {
    let payload = JSON.stringify({
      RelyingParty: 'http://xboxlive.com',
      TokenType: 'JWT',
      Properties: {
        UserTokens: [token],
        SandboxId: 'RETAIL',
      }
    });

    let authorizeRequestOptions = {
      uri: 'https://xsts.auth.xboxlive.com/xsts/authorize',
      method: 'POST',
      body: payload,
      headers: {
        'Cookie': cookie,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload, 'utf8'),
      }
    };

    return request(authorizeRequestOptions, (error, response, body) => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body);
      } catch (e) { }

      if (parsedBody) {
        let authorizationHeader;
        try {
          this.authStore.notAfter = parsedBody.NotAfter;
        } catch (e) { }
        try {
          authorizationHeader = 'XBL3.0 x=' + parsedBody.DisplayClaims.xui[0].uhs + ';' + parsedBody.Token;
        } catch (e) { }

        if (cookie && authorizationHeader) {
          return this.afterAuthorizationHeader(gamertag, callback, cookie, authorizationHeader);
        } else {
          return this.afterRequestHeader(gamertag, callback);
        }
      } else {
        return this.afterRequestHeader(gamertag, callback);
      }
    });
  }

  afterAuthorizationHeader(gamertag, callback, cookie, authorizationHeader) {
    let requestHeader = {
      'Cookie': cookie,
      'Content-Type': 'application/json',
      'x-xbl-contract-version': '2',
      'User-Agent': 'guardian.theater Like SmartGlass/2.105.0415 CFNetwork/711.3.18 Darwin/14.0.0',
      'Authorization': authorizationHeader,
    };
    this.authStore.requestHeader = requestHeader;
    return this.afterRequestHeader(gamertag, callback, requestHeader);
  }

  afterRequestHeader(gamertag, callback, requestHeader) {
    if (this.xuids[gamertag]) {
      return this.afterXuid(gamertag, callback, requestHeader, this.xuids[gamertag]);
    } else {
      return this.fetchXuid(gamertag, callback, requestHeader);
    }
  }

  fetchXuid(gamertag, callback, requestHeader) {
    if (requestHeader) {
      let xuidRequestOptions = {
        uri: 'https://profile.xboxlive.com/users/gt(' + encodeURIComponent(gamertag) + ')/profile/settings',
        method: 'GET',
        headers: requestHeader,
        pool: false
      };
      return request(xuidRequestOptions, (error, response, body) => {
        let xuid;
        try {
          xuid = JSON.parse(body).profileUsers[0].id;
        } catch (e) { }
        if (xuid) {
          this.xuids[gamertag] = xuid;
          return this.afterXuid(gamertag, callback, requestHeader, xuid);
        } else {
          return this.afterXuid(gamertag, callback);
        }
      });
    } else {
      return this.afterXuid(gamertag, callback);
    }
  }

  afterXuid(gamertag, callback, requestHeader, xuid) {
    if (requestHeader && xuid) {
      return callback({
        uri: 'https://gameclipsmetadata.xboxlive.com/users/xuid(' + xuid + ')/titles/247546985/clips?maxItems=200',
        method: 'GET',
        headers: requestHeader,
        pool: false
      });
    } else {
      return callback(null);
    }
  }
};