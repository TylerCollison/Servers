"use strict";

const actionsOnGoogle = require("actions-on-google");
const ApiAiApp = actionsOnGoogle.ApiAiApp;
const http = require("http");
const Express = require("express");
const bp = require("body-parser");

//The address of this server
const ADDRESS = "https://aog-fulfillment-in-app-login.herokuapp.com";

//Holds associations between conversations and access tokens
var conversationIdAccessTokenMap = new Map();

//Holds associations between conversations and user IDs
var userIdConversationIdMap = new Map();

//Setup express layer
const express = new Express();
express.use(bp.json({type: 'application/json'})); 

//Setup HTTP server
var server = http.createServer(express);

/**
 * Handles login route GET requests in case deep linking fails
 * 
 * Request Format: GET /login?conversation_id=CONVERSATION_ID
 * where the conversation_id corresponds to the user's currently running conversation
 */
express.get("/login", (req, res) => {
    //Parse query string for conversation ID
    var conversationId = req.query.conversation_id;
    //Redirect the browser to the Bank of America App
    res.redirect("bofa://aog?conversation_id=" + conversationId.toString());
});

/**
 * Handles setup route GET requests to allow remote sign-on from mobile device
 * 
 * Request Format: GET /setup?user_id=USER_ID
 */
express.get("/setup", (req, res) => {
    //Parse query string for user ID
    var userId = req.query.user_id;
    //Redirect the browser to the Bank of America App
    res.redirect("bofa://ghsetup?user_id=" + userId.toString());
});

/**
 * Handles status route GET requests and responds with the specified user's current login status
 * 
 * Request Format: GET /status?user_id=USER_ID
 */
express.get("/status", (req, res) => {
    console.log("received status request");
    //Parse query string for user ID
    var userId = req.query.user_id;
    //Determine the status of the user
    var status = "logged_out";
    if (typeof(userId) != 'undefined') {
        if (conversationIdAccessTokenMap.has(userId)) {
            status = "ready";
            if (userIdConversationIdMap.has(userId)) {
                status = "talking";
            }
        }
    }
    //Form the response
    var response = {
        status: status
    }
    //respond
    res.status(200).send(JSON.stringify(response));
});

/**
 * Associates conversation IDs with access tokens received from client applications
 * 
 * Request Format: POST {"conversation_id":"CONVERSATION_ID","access_token":"ACCESS_TOKEN"}
 * where conversation_id corresponds to the conversation that access_token should be linked to
 */
express.post("/authenticate", (req, res) => {
    //Parse the parameters
    var conversationId = req.body.conversation_id;
    var accessToken = req.body.access_token;
    //Determine whether any parameters were missing
    if (typeof(conversationId) != 'undefined' && typeof(accessToken) != 'undefined') {
        //Associate the access token with the conversation
        conversationIdAccessTokenMap.set(conversationId, accessToken);
        //Send a success response back to the client
        res.status(200).send("access_token registered for conversation " + conversationId.toString());
        console.log("registered access token for conversation " + conversationId.toString());
    } else {
        //Some parameters were missing; send an error message to the client
        res.status(400).send("400 Bad Request: some parameters were missing");
        console.log("Some parameters were missing");
    }
});

/**
 * Handle HTTP requests sent from the Actions on Google and API.AI Webhook
 * 
 * Request Format: follows the Actions on Google Request/Response Webhook specification
 */
express.post('/', (req, res) => {
    //Constants for user special user intents
    const SETUP_GOOGLE_HOME_INTENT = "input.setup";
    const EXIT_INTENT = "input.exit";

    //Parse API.AI conversation ID
    var conversationId = req.body.sessionId;
    //Wrap the HTTP request in a new ApiAiApp object
    const app = new ApiAiApp({request: req, response: res});
    //Get the device's capabilities
    var hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT);

    //Determine whether the requesting device is audio-only
    if (!hasScreen) {
        console.log("User ID: " + app.getUser().userId.toString());
        //Determine if another conversation is running for this user
        if (userIdConversationIdMap.has(app.getUser().userId) && 
        userIdConversationIdMap.get(app.getUser().userId) != conversationId) {
            //Delete conversation associated with this user
            conversationIdAccessTokenMap.delete(app.getUser().userId);
            userIdConversationIdMap.delete(app.getUser().userId);
            //Ask for new sign-in
            app.ask("I need you to sign in again before I can talk to you.")
        } else {
            //Create an association between this conversation and the user ID
            userIdConversationIdMap.set(app.getUser().userId, conversationId);
            //If there is no screen, switch the conversation ID to the User ID
            conversationId = app.getUser().userId;
        }
    }

    /**
     * Ends the current conversation
     * @param {*The ApiAiApp for the conversation} app 
     */
    var exit = function(app) {
        //End the current conversation
        app.tell("Good bye");
        //Delete the access token for this conversation
        conversationIdAccessTokenMap.delete(conversationId);
        //Delete the association between this conversation and the user ID
        userIdConversationIdMap.delete(conversationId);
    }

    /**
     * Sends a deep link to initiate the remote login setup process on a local application
     * @param {*The ApiAiApp through which to send the response} app 
     */
    var setupRemoteLogin = function(app) {
        //Create and display "setup" button with embedded deep link and conversationToken
        var richResponse = app.buildRichResponse();
        richResponse.addSimpleResponse('Alright, tap this button to setup your Google Home');
        richResponse.addSuggestionLink("Setup Google Home", ADDRESS + "/setup?user_id=" + app.getUser().userId.toString());
        app.ask(richResponse);
        console.log("Sent sign-in button to user for conversation: " + conversationId);
    }

    //Map intent identifiers to their corresponding functions
    var intentMap = new Map();
    intentMap.set(SETUP_GOOGLE_HOME_INTENT, setupRemoteLogin);
    intentMap.set(EXIT_INTENT, exit);

    /**
     * Send a sign-in button to the user
     * @param {The ApiAiApp through which to send the sign-in button} app 
     */
    var createSignInButton = function(app) {
        //Create and display "login" button with embedded deep link and conversationToken
        var richResponse = app.buildRichResponse();
        richResponse.addSimpleResponse('I need you to sign in before I can do that');
        richResponse.addSuggestionLink("Login", ADDRESS + "/login?conversation_id=" + conversationId.toString());
        app.ask(richResponse);
        console.log("Sent sign-in button to user for conversation: " + conversationId);
    }

    /**
     * Handle user intent by either processing a response using an access token or requesting user sign-in
     * @param {The ApiAiApp through which to communicate} app 
     */
    var handleIntent = function(app) {
        //Get the current intent
        var intent = app.getIntent();
        console.log("intent: " + intent.toString());
        //Determine whether this is a special intent
        var specialIntentFunction = intentMap.get(intent.toString());
        console.log(intentMap.size.toString());
        if (typeof(specialIntentFunction) === 'undefined') {
            console.log("Received " + intent.toString() + " intent for conversation " + conversationId.toString());
            if (conversationIdAccessTokenMap.has(conversationId)) {
                //TODO: use the access token to retrieve meaningful data
                //This line simply demonstrates that the access token was retrieved
                app.ask("Access Token: " + conversationIdAccessTokenMap.get(conversationId));
            } else {
                //There is no stored access token; ask the user to sign in 
                createSignInButton(app);
            }
        } else {
            //Handle the special intent
            specialIntentFunction(app);
        }
    }

    //Process the incoming request
    app.handleRequest(handleIntent);
});

var port = process.env.PORT;
//Uncomment to test on localhost, port 8000
//var port = 8000;
server.listen(port, () => {
    console.log("BA App Server bound on port: " + port.toString());
});