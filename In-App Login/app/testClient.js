const WebSocket = require('ws');
var socket = new WebSocket('ws://aog-fulfillment-ios-android.herokuapp.com/');
//ws://aog-fulfillment-ios-android.herokuapp.com/
var stdin = process.openStdin();

var conversationId = "";

function sendJSONMessage (sock, message) {
    var jsonString = JSON.stringify(message);
    sock.send(jsonString);
}

function sendRegistration(sock, conversationId) {
    var registrationPayload = {
        conversationId: conversationId,
        type: "register"
    }
    sendJSONMessage(sock, registrationPayload);
}

function sendResponse(sock, conversationId, response) {
    var responsePayload = {
        conversationId: conversationId, 
        type: "response", 
        response: response
    }
    sendJSONMessage(sock, responsePayload);
}

stdin.addListener('data', (data) => {
    conversationId = data.toString().replace("\r", "").replace("\n", "");
    console.log(conversationId);
    sendRegistration(socket, conversationId);
});

socket.on('open', () => {
    console.log("Connected to server");
});

socket.on('message', (data) => {
    console.log(data);
    var jsonData = JSON.parse(data.toString());
    var query = jsonData.query;
    if (query === 'undefined') {
        console.log("The server sent invalid data");
    } else {
        var queryString = query.toString();
        //TODO: do something with the query to retrieve relevant data
        sendResponse(socket, conversationId, "Sample Response");
    }
});

console.log("Client started");