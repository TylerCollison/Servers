#!/bin/bash
echo "Enter the body of the post request"
read body
curl -k -X POST -H "Host: oath2.example.com" -H "Content-Type: application/x-www-form-urlencoded" -d "$body" https://127.0.0.1:8443/exchange