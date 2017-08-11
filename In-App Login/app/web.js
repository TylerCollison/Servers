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
    //Parse API.AI conversation ID
    var conversationId = req.body.sessionId;

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
        //Get the conversation ID
        var intent = app.getIntent();
        console.log("Received " + intent.toString() + " intent for conversation " + conversationId.toString());
        if (conversationIdAccessTokenMap.has(conversationId)) {
            //TODO: use the access token to retrieve meaningful data

            //This line simply demonstrates that the access token was retrieved
            app.ask("Access Token: " + conversationIdAccessTokenMap.get(conversationId));
        } else {
            //There is no stored access token; ask the user to sign in 
            createSignInButton(app);
        }
    }

    //Wrap the HTTP request in a new ApiAiApp object
    const app = new ApiAiApp({request: req, response: res});
    //Process the incoming request
    app.handleRequest(handleIntent);
});

var port = process.env.PORT;
//Uncomment to test on localhost, port 8000
//var port = 8000;
server.listen(port, () => {
    console.log("BA App Server bound on port: " + port.toString());
});