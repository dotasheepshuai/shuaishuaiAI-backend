const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();
const {isEmpty, random} = require('lodash');

exports.handler = async (event) => {
    log(event);
    const input = event.queryStringParameters.input;
    const output = await getAIResponse(input);
    return getResponsePayload(output);
};

async function getAIResponse(input) {
    const params = {
        ExpressionAttributeValues: {
            ":v1": {
                S: input
            }
        },
        KeyConditionExpression: "Question = :v1",
        ProjectionExpression: "Answers",
        TableName: 'Conversation'
    };
    const dynamodbResponses = await new Promise((resolve, reject) => {
        dynamodb.query(params, (error, data) => {
            if (error) {
                log(error);
                reject(error);
            }
            const responses = ((data.Items[0] || {}).Answers || {}).SS || [];
            resolve(responses);
        });
    });
    log(`Input is "${input}", dynamodb responses are "${JSON.stringify(dynamodbResponses)}"`);

    // Stupid path
    if (isEmpty(dynamodbResponses)) {
        const stupidOutput = input.replace(/\?/g, '!');
        log(`Use stupid output "${stupidOutput}" because dynamodb responses are empty.`);
        return stupidOutput;
    }

    // Clever path
    const randomNumber = random(dynamodbResponses.length-1);
    const cleverOutput = dynamodbResponses[randomNumber];
    log(`Pick the ${randomNumber}-th value from the list - "${cleverOutput}", as the clever output`);
    return cleverOutput;
}

function getResponsePayload(text) {
    return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(text),
    };
}

function log(text) {
    console.log(text);
}