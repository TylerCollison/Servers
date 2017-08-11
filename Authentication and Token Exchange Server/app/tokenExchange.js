//The valid grant types
module.exports.GrantTypes = {
    AUTHORIZATION_CODE: "authorization_code",
    REFRESH_TOKEN: "refresh_token"
}

/**
 * Determines whether a token exchange request is valid (for either an authorization code or refresh token)
 * @param {The expected client ID} clientId 
 * @param {The expected client secret corresponding to the client ID} clientSecret 
 * @param {The body of the request} body 
 */
function exchangeRequestIsValid(clientId, clientSecret, body){
    var result = false;

    //Parse parameters
    var id = body.client_id;
    var secret = body.client_secret;
    var grantType = body.grant_type;

    if(typeof(id) != 'undefined' && typeof(secret) != 'undefined' &&
    typeof(grantType) != 'undefined') {
        console.log("All request parameters were provided");
        //Determine whether the provided parameters are valid
        if (id.toString() === clientId &&
            secret.toString() === clientSecret) {
                console.log("Request validated");
                result = true;
            }
    }

    return result;
}
module.exports.exchangeRequestIsValid = exchangeRequestIsValid;

/**
 * Gets the grant type associated with the body of the supplied request
 * @param {The body of the request} body 
 */
function getGrantType(body) {
    var grantType = body.grant_type;
    return grantType;
}
module.exports.getGrantType = getGrantType;

/**
 * Gets the authorization code corresponding to the supplied request body
 * @param {The body of the request} body 
 */
function getAuthorizationCode(body) {
    return decodeURIComponent(body.code.toString());
}
module.exports.getAuthorizationCode = getAuthorizationCode;

/**
 * Gets the refresh token corresponding to the supplied request body
 * @param {The body of the request} body 
 */
function getRefreshToken(body) {
    return decodeURIComponent(body.refresh_token.toString());
}
module.exports.getRefreshToken = getRefreshToken;

/**
 * Determines whether the supplied authorization record is still valid
 * @param {The authorization record to be validated} authRecord 
 */
function validateAuthorizationRecord(authRecord) {
    return authRecord.expires > new Date();
}
module.exports.validateAuthorizationRecord = validateAuthorizationRecord;

/**
 * Create and register a new access token for the given user
 * @param {The username of the user for which to create the access token} username 
 */
function createAccessRecord (accessTokenLifetime, clientId, authRecord) {
    var username = authRecord.username;

    //Calculate the expiration date for the access token
    var currentDateTime = new Date();
    var expirationTime = new Date(currentDateTime.getTime() + accessTokenLifetime);
    //Create the access token record
    var record = {
        username: username,
        clientID: clientId,
        expiration: expirationTime
    }
    
    return record;
}
module.exports.createAccessRecord = createAccessRecord;

/**
 * Generates a new refresh record
 * @param {The authorization code corresponding to the refresh record} authRecord 
 * @param {The client ID to be associated with the refresh record} clientId 
 */
function generateRefreshRecord(authRecord, clientId) {
    return {
        username: authRecord.username,
        clientID: clientId
    }
}
module.exports.generateRefreshRecord = generateRefreshRecord;

/**
 * Generates a new authorization code response to be sent to a client in response to receiving an authorization code request
 * @param {The access token to be transmitted} accessToken 
 * @param {The refresh token to be transmitted} refreshToken 
 * @param {The lifetime of the access token before expiration} accessTokenLifetime 
 */
function generateAuthorizationCodeResponse(accessToken, refreshToken, accessTokenLifetime) {
    return {
        token_type: "bearer",
        access_token: encodeURIComponent(accessToken),
        refresh_token: encodeURIComponent(refreshToken),
        expires_in: accessTokenLifetime / 1000
    }
}
module.exports.generateAuthorizationCodeResponse = generateAuthorizationCodeResponse;

/**
 * Generates a new refresh token response to be sent to a client in response to receiving a refresh token request
 * @param {The access token to be transmitted} accessToken 
 * @param {The lifetime of the access token before expiration} accessTokenLifetime 
 */
function generateRefreshTokenResponse(accessToken, accessTokenLifetime) {
    return {
        token_type: "bearer",
        access_token: encodeURIComponent(accessToken),
        expires_in: accessTokenLifetime / 1000
    }
}
module.exports.generateRefreshTokenResponse = generateRefreshTokenResponse;