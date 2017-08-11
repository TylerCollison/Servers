const http = require('http');
const fs = require('fs');
const express = require('express');
const bp = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const authorization = require('./authorization');
const exchange = require("./tokenExchange");

//Authorization and Token Exchange settings file
const SETTINGS_FILE = __dirname + "/settings.json";

//Google identity credentials
const CLIENT_ID = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")).clientId;
const CLIENT_SECRET = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")).clientSecret;

//Constants for authorization
const EXPECTED_RESPONSE_TYPE = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")).expectedResponseType;
const PROJECT_ID = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")).projectId;
const EXPECTED_REDIRECT_URI = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")).expectedRedirectUriHost + PROJECT_ID;

//Constants for token exchange
const ACCESS_TOKEN_LIFETIME = 1800000;
const AUTH_CODE_LIFETIME = 600000;

//Constants for database
const VALID_LOGIN_CREDENTIALS_FILE = __dirname + "/data/validLoginCredentials.json";
const AUTHORIZATIONS_TABLE_FILE = __dirname + "/data/authorizationsTable.json";
const REFRESH_TABLE_FILE = __dirname + "/data/refreshTable.json";
const ACCESS_TABLE_FILE = __dirname + "/data/accessTable.json";

//Map of valid login usernames and corresponding passwords maintained for testing purposes
var validLoginCredentials = JSON.parse(fs.readFileSync(VALID_LOGIN_CREDENTIALS_FILE, "utf8"));

//The following tables manage all authorization codes, refresh tokens, and access tokens
//These tables are only provided for testing and demonstration purposes and should be replaced
//with a true database
var authorizationsTable = JSON.parse(fs.readFileSync(AUTHORIZATIONS_TABLE_FILE, "utf8"));
var refreshTable = JSON.parse(fs.readFileSync(REFRESH_TABLE_FILE, "utf8"));
var accessTable = JSON.parse(fs.readFileSync(ACCESS_TABLE_FILE, "utf8"));

//Map of currently issued user tokens and corresponding redirect URLs
var userTokenRedirectMap = new Map();

//Setup express
var app = express();
app.use(bp.urlencoded());
app.use(express.static("public"));

//Create the HTTP server
var server = http.createServer(app);

/**
 * Handle validate route Get requests to determine whether an access token is valid and return token information
 * 
 * Request Format: GET /validate?access_token=ACCESS_TOKEN
 */
app.get("/validate", (req, res) => {
    //Parse the access token from the request
    var accessToken = decodeURIComponent(req.query.access_token.toString());
    //Determine whether the access token is valid
    if (accessToken != 'undefined' && accessTable.hasOwnProperty(accessToken)) {
        //The access token is valid; send its record information to the requester
        var accessRecord = accessTable[accessToken];
        var response = JSON.stringify(accessRecord);
        res.send(response);
        console.log("Sent access record: ");
        console.log(response);
    } else {
        //The access token was invalid, send a correspondign response to the requester
        console.log("Access token " + accessToken.toString() + " is not valid");
        res.status(403).send("403 Forbidden: The access token was not valid");
    }
});

/**
 * Handle login route GET requests to login with credentials and return redirect URL
 * 
 * Request Format: GET /login?login_token=LOGIN_TOKEN&username=USERNAME&password=PASSWORD
 */
app.get("/login", (req, res) => {
    //Determine whether the login request was valid
    if(authorization.loginRequestIsValid(validLoginCredentials, req.query)) {
        //Generate the authorization record
        var authRecord = authorization.generateAuthorizationRecord(AUTH_CODE_LIFETIME, CLIENT_ID, req.query);

        //Create authorization code
        var authcode = crypto.createHash('sha256').update(authRecord.username.toString() + authRecord.clientId + authRecord.expires.toDateString()).digest('base64');

        //Store the authorization record in the database
        authorizationsTable[authcode] = authRecord;
        fs.writeFileSync(AUTHORIZATIONS_TABLE_FILE, JSON.stringify(authorizationsTable));

        //Send redirect to client
        var redirectInfo = authorization.getRedirectInfo(req.query);
        res.send(redirectInfo.uri.toString() + "?code=" + encodeURIComponent(authcode) + 
            "&state=" + redirectInfo.state.toString());
        console.log("Redirect to Google redirect handler");
    } else {
        //Handle invalid login attempt
        res.status(403).send();
        console.log("The login credentials were invalid");
    }
});

/**
 * Handle auth route GET signin requests
 * 
 * Request Format: GET /auth?client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&state=STATE&response_type=code
 * where client_id identifies the client service (e.g. Google), redirect_uri is the location to which to redirect the user upon sign-in, 
 * state is a persistent book-keeping value, and response_type is always code. The redirect_uri must match the expected form. 
 */
app.get("/auth", (req, res) => {
    console.log("Received GET request");

    if (authorization.authorizationRequestIsValid(CLIENT_ID, EXPECTED_RESPONSE_TYPE, EXPECTED_REDIRECT_URI, req.query)) {
        //Create a signin session and store its identifying token
        token = authorization.createSignInSession(req.query);

        //Direct the user to the signin page
        app.get('/signin', (req, res) => {
            res.sendFile(path.join(__dirname + "/public/loginPage.html"));
        });
        res.redirect('/signin?login_token=' + encodeURIComponent(token));
        console.log("Redirected to login page with token: " + token.toString());
    } else {
        //Handle a bad request 
        res.status(400).send("400 Bad Request: malformed uri");
        console.log("The request was not valid");
    }
});

/**
 * Handle exchange route POST requests to exchange refresh tokens and authorization codes
 * for refresh tokens and access tokens
 * 
 * Request Format: POST client_id=CLIENT_ID&client_secret=CLIENT_SECRET&grant_type=GRANT_TYPE&code=CODE
 * where client_id corresponds to the client service (e.g. Google), client_secret is a secret credential given to the client, 
 * grant_type is either authorization_code or refresh_token, and code is the authorization code if the grant_type is authorization_code.
 * Otherwise, code is replaced with refresh_token with a value corresponding to the refresh token.
 */
app.post("/exchange", (req, res) => {
    console.log("Recieved POST request");

    if (exchange.exchangeRequestIsValid(CLIENT_ID, CLIENT_SECRET, req.body)) {
        var grantType = exchange.getGrantType(req.body);
        switch(grantType) {
            //The grant type is an authorization code
            case exchange.GrantTypes.AUTHORIZATION_CODE: 
                var authorizationCode = exchange.getAuthorizationCode(req.body);
                //Verify authorization code
                if (authorizationsTable.hasOwnProperty(authorizationCode.toString())) {
                    console.log("Authorization code verified");
                    var authRecord = authorizationsTable[authorizationCode];

                    //Determine whether the authorization code has expired
                    if (exchange.validateAuthorizationRecord(authRecord)) {
                        //The authorization code is valid; get the access and refresh tokens
                        console.log("Authorization code has not expired");
                        var accessRecord = exchange.createAccessRecord(ACCESS_TOKEN_LIFETIME, CLIENT_ID, authRecord);

                        //Generate the access token
                        var accessToken = crypto.createHash('sha256').update(accessRecord.username.toString() + CLIENT_ID + accessRecord.expiration.toTimeString()).digest('base64');
                        //Store the access token
                        accessTable[accessToken] = accessRecord;
                        //Save the updated access token directory to disk
                        fs.writeFileSync(ACCESS_TABLE_FILE, JSON.stringify(accessTable));

                        var refreshToken = crypto.createHash('sha256').update(authRecord.username.toString() + CLIENT_ID).digest('base64');
                        
                        //Update the refresh table
                        refreshTable[refreshToken] = exchange.generateRefreshRecord(authRecord, CLIENT_ID);
                        fs.writeFileSync(REFRESH_TABLE_FILE, JSON.stringify(refreshTable));

                        //Received authorization code, respond with access and refresh tokens
                        var jsonResponse = exchange.generateAuthorizationCodeResponse(accessToken, refreshToken, ACCESS_TOKEN_LIFETIME);
                        res.json(jsonResponse).send();
                        console.log("Access and Refresh tokens sent");
                    } else {
                        //The authorization code was expired
                        console.log("Authorization code has expired");
                        consoel.log("Expired: " + authcodeExpiration.toLocaleString());
                        res.status(403).send("403 Forbidden: authorization code has expired");
                    }
                } else {
                    //The authorization code was invalid
                    res.status(403).send("403 Forbidden: invalid authorization code: " + authorizationCode.toString());
                    console.log("Invalid authorization code: " + authorizationCode.toString());
                }
                break;

            case exchange.GrantTypes.REFRESH_TOKEN:
                var refreshToken = exchange.getRefreshToken(req.body)
                //Verify refresh token
                if (refreshTable.hasOwnProperty(refreshToken.toString())) {
                    console.log("Refresh token verified");
                    //Generate the access token
                    var refreshRecord = refreshTable[refreshToken];
                    var accessToken = exchange.createAccessRecord(refreshRecord);

                    //Received refresh token, respond with access token
                    res.json(exchange.generateRefreshTokenResponse(accessToken, ACCESS_TOKEN_LIFETIME)).send();
                    console.log("Access token sent");
                } else {
                    //The refresh token was invalid
                    res.status(403).send("403 Forbidden: invalid refresh token: " + refreshToken.toString());
                    console.log("Invalid refresh token: " + refreshToken.toString());
                }
                break;

            default:
                //The grant type specified is not recognized
                res.status(400).send("400 Bad Request: unrecognized grant type");
                console.log("Could not recognize grant type");
                break;
        }
    } else {
        //Handle bad request
        res.status(400).send("400 Bad Request: malformed uri");
        console.log("The request was not valid");
    }
});

var port = process.env.PORT;
//Uncomment to test on local port 8443
//var port = 8443;
server.listen(port);
console.log("Listening on port: " + port.toString());