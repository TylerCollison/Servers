"use strict";

const actionsOnGoogle = require("actions-on-google");
const ApiAiApp = actionsOnGoogle.ApiAiApp;
const http = require("http");
const Express = require("express");
const bp = require("body-parser");
const WebSocket = require("ws");

//Constant for the default response when the user is not signed in
const NO_SIGN_IN_DEFAULT_RESPONSE = "**Not Authorized**";
//Constant for the address of this server
const ADDRESS = "https://aog-fulfillment-ios-android.herokuapp.com";

//Holds associations between conversations and client sockets
var conversationIdSocketMap = new Map();

//Setup express layer
const express = new Express();
express.use(bp.json({type: 'application/json'})); 

//Setup HTTP server
var server = http.createServer(express);

//Setup ws layer
const wss = new WebSocket.Server({ server });

/**
 * Forwards a query to the client websocket associated with the given conversation
 * @param {Data related to the user's query as a string} queryText 
 * @param {The string representation of the conversation's conversation ID} conversationId 
 * @param {A callback function taking a string data parameter, used to return the response from the client} cb 
 */
var askApp = function(queryText, conversationId, cb) {
    //Check whether an app has been linked to this conversation
    var linkedAppSocket;
    if (conversationIdSocketMap.has(conversationId) && (linkedAppSocket = conversationIdSocketMap.get(conversationId)).readyState === 1) {
        console.log("Found linked app");
        //Create the JSON query for the linked app
        var jsonQuery = {
            query: queryText.toString()
        }
        var jsonQueryString = JSON.stringify(jsonQuery);
        //Send the query to the linked app
        linkedAppSocket.send(jsonQueryString);
        //Setup the 'data' event to return the response in the callback function
        var responseListener = function(data) {
            //Parse the JSON data payload
            var stringData = data.toString('utf8');
            var jsonData = JSON.parse(stringData);
            var type = jsonData.type.toString();
            if (type === "response") {
                //Call the callback function with the response text
                var responseText = jsonData.response.toString();
                cb(responseText);
                console.log("Received response from app: " + responseText);
            } else {
                //Handle error response
                console.log("ERROR: Invalid response");
            }
        }
        //Set response listener
        linkedAppSocket.on('message', responseListener);
    } else {
        //Return a default response
        cb(NO_SIGN_IN_DEFAULT_RESPONSE);
        console.log("The user was not signed-in: ", conversationIdSocketMap);
    }
}

/**
 * Handles the websocket handshake with new clients
 */
wss.on('connection', (socket, req) => {
    console.log("Connected to client");
    //Listens for the client to register for a conversation
    var registrationListener = function(data) {
        //Get parameters
        var stringData = data.toString('utf8');
        var jsonData = JSON.parse(stringData);
        var conversationId = jsonData.conversationId.toString();
        var type = jsonData.type.toString();
        //Check whether the request type is "register" and whether a conversation ID was provided
        if (type === "register" && typeof(conversationId) != 'undefined') {
            //Create an association between the client socket and the conversation
            conversationIdSocketMap.set(conversationId, socket);
            console.log("Registered app for conversation: " + conversationId);
            //Registration is complete; remove the registration listener for this socket
            socket.removeEventListener('message', registrationListener);
        } else {
            //Handle error response
            console.log("ERROR: Invalid request type or parameters missing");
        }
    }
    //Set registration listener
    socket.on('message', registrationListener);
});

/**
 * Handle HTTP POST requests sent from the Actions on Google and API.AI Webhook
 * 
 * Request Format: follows the standard Actions on Google Conversation Webhook
 */
express.post('/', (req, res) => {
    //Get the API.AI conversation ID
    var conversationId = req.body.sessionId;

    /**
     * Send a sign-in button to the user
     * @param {The ApiAiApp to send the button through} app 
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
     * Handles the incoming intent either forwarding a query to a client application or requesting user sign-in
     * @param {The ApiAiApp from which to handle the intent} app 
     */
    var handleIntent = function(app) {
        //Get the conversation ID
        var intent = app.getIntent();
        console.log("Received " + intent.toString() + " intent for conversation " + conversationId.toString());
        //Get the user's raw input as text
        var rawInput = app.getRawInput();
        //Ask the linked app for a response based on the raw input
        askApp(rawInput, conversationId, (response) => {
            if (response === NO_SIGN_IN_DEFAULT_RESPONSE) {
                //Request user sign-in
                createSignInButton(app);
                console.log("Requested user sign-in");
            } else {
                //Tell a response, but keep the conversation alive by 'asking' it
                app.ask(response);
                console.log("Told the user: " + response);
            }
        });
    }

    //Wrap the HTTP request in the API.AI Node js app
    const app = new ApiAiApp({request: req, response: res});
    //Process the incoming request
    app.handleRequest(handleIntent);
});

var port = process.env.PORT;
//Uncomment to test on localhost, port 8000
//var port = 8000;
server.listen(port, () => {
    console.log("Server bound on port: " + port.toString());
});