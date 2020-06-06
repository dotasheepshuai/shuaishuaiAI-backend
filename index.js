const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();
const {isEmpty, random, without, uniq} = require('lodash');

exports.handler = async (event) => {
    log(event);
    const input = event.queryStringParameters.input;
    const output = event.queryStringParameters.output;

    if (event.httpMethod === 'GET') {
        const response = await getAIResponse(input);
        return getResponsePayload(response);

    } else if (event.httpMethod === 'POST') {
        await setAIResponse(input, output);
        return getResponsePayload('Success!');

    } else if (event.httpMethod === 'DELETE') {
        await deleteAIResponse(input, output);
        return getResponsePayload('Success!');

    } else {
        return log(`event.httpMethod "${event.httpMethod}" is not supported`);
    }

};

async function getAIResponse(input) {
    const dynamodbResponses = await queryInput(input);

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

async function setAIResponse(input, output) {
    const dynamodbResponses = await queryInput(input);
    const newResponses = uniq(dynamodbResponses.concat(output));

    await updateInput(input, newResponses);
}

async function deleteAIResponse(input, output) {
    const dynamodbResponses = await queryInput(input);
    let newResponses = without(dynamodbResponses, output);
    if (isEmpty(newResponses)) {
        newResponses = newResponses.concat(input.replace(/\?/g, '!'));
    }

    await updateInput(input, newResponses);
}

async function queryInput(input) {
    const queryParams = {
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
        dynamodb.query(queryParams, (error, data) => {
            if (error) {
                log(error);
                reject(error);
            }
            const responses = ((data.Items[0] || {}).Answers || {}).SS || [];
            resolve(responses);
        });
    });
    log(`Input is "${input}", dynamodb responses are "${JSON.stringify(dynamodbResponses)}"`);
    return dynamodbResponses;
}

async function updateInput(input, newResponses) {
    const updateParams = {
        ExpressionAttributeValues: {
            ":v1": {
                SS: newResponses
            }
        },
        Key: {
            "Question": {
                S: input
            }
        },
        UpdateExpression: "SET Answers = :v1",
        TableName: 'Conversation'
    };
    await new Promise((resolve, reject) => {
        dynamodb.updateItem(updateParams, (error) => {
            if (error) {
                log(error);
                reject(error);
            }
            resolve();
        });
    });
    return log(`Dynamodb responses for input "${input}" were updated to "${JSON.stringify(newResponses)}"`);
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
    return console.log(text);
}