const crypto = require('crypto');

//Map of currently issued user tokens and corresponding redirect URLs
var userTokenRedirectMap = new Map();

/**
 * Determines whether an authorization request is valid
 * 
 * @param expectedClientId The client ID that the server is expecting to receive
 * @param {The response type that the server is expecting to receive} expectedResponseType 
 * @param {The query string of the request} query 
 */
function authorizationRequestIsValid(expectedClientId, expectedResponseType, 
    expectedRedirectUri, query) {
    var result = false;

    //Parse the request parameters
    var clientId = query.client_id;
    var redirectUri = query.redirect_uri;
    var state = query.state;
    var responseType = query.response_type;

    //Determine whether all variables were provided for signin
    if (typeof(clientId) != 'undefined' && typeof(redirectUri) != 'undefined' &&
        typeof(state) != 'undefined' && typeof(responseType) != 'undefined') {
        console.log("All request parameters were provided");
        //Determine whether the provided parameters are valid
        if (clientId.toString() === expectedClientId && 
            responseType.toString() === expectedResponseType &&
            redirectUri.toString() === expectedRedirectUri) {
            console.log("Request validated");
            result = true;
        }
    }

    return result;
}
module.exports.authorizationRequestIsValid = authorizationRequestIsValid;

/**
 * Creates a new sign-in session for a user
 * @param {The query string of the request} query 
 */
function createSignInSession(query) {
    //Parse the request parameters
    var redirectUri = query.redirect_uri;
    var state = query.state;

    //Form redirect URI with parameters
    var redirectInfo = {
        uri: redirectUri.toString(),
        state: state.toString()
    }

    //Generate a random book keeping token for user signin
    var token = crypto.randomBytes(64).toString('hex');
    //Associate the token with the redirect URI
    userTokenRedirectMap.set(token, redirectInfo);

    return token;
}
module.exports.createSignInSession = createSignInSession;

/**
 * Determines whether a login request is valid
 * @param {An object containing valid user login credentials in username:password format} validLoginCredentials 
 * @param {The query string of the request} query 
 */
function loginRequestIsValid(validLoginCredentials, query) {
    var result = false;

    //Parse the user token from the query string
    var userToken = query.login_token;

    //Determine whether the user token was provided 
    if(typeof(userToken) != 'undefined') {
        //Determine whether the user token is valid
        if (userTokenRedirectMap.has(userToken.toString())) {
            //Parse the user login credentials
            var username = query.username;
            var password = query.password;
            //Determine whether the username is valid
            if (validLoginCredentials.hasOwnProperty(username.toString())) {
                //Determine whether the password is valid
                var validPassword = validLoginCredentials[username];
                if (validPassword.toString() === password.toString()) {
                    result = true;
                }
            }
        }
    }

    return result;
}
module.exports.loginRequestIsValid = loginRequestIsValid;

/**
 * Gets the redirect information associated with the supplied query string
 * @param {The query string of the request} query 
 */
function getRedirectInfo(query) {
    var userToken = query.login_token;
    //Get the redirect information associated with the user token
    var info = userTokenRedirectMap.get(userToken);
    //Delete the user token from the redirect map
    userTokenRedirectMap.delete(userToken);
    return info;
}
module.exports.getRedirectInfo = getRedirectInfo;

/**
 * Generates a new authorization record
 * @param {The lifetime of the authorization code before expiration} authCodeLifetime 
 * @param {The ID of the client to which the authorization code will be given} clientId 
 * @param {The query string of the request} query 
 */
function generateAuthorizationRecord(authCodeLifetime, clientId, query) {
    //Parse the query string for parameters
    var username = query.username;

    //Calculate the authorization code expiration date
    var currentDateTime = new Date();
    var expirationTime = new Date(currentDateTime.getTime() + authCodeLifetime);
    console.log("Authorization Code Expires: " + expirationTime.toTimeString());

    var authorizationRecord = {
        username: username,
        clientID: clientId,
        expires: expirationTime
    }

    return authorizationRecord;
}
module.exports.generateAuthorizationRecord = generateAuthorizationRecord;