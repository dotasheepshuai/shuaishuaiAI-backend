const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();
const sns = new AWS.SNS({region: 'us-east-1'});
const {isEmpty, random, without, uniq, find} = require('lodash');
const {SymbolRegex, Chinese_Blacklist, Chinese_Blacklist_Response, English_Blacklist, English_Blacklist_Response} = require('./constants');

exports.handler = async (event) => {
    log(event);
    const type = event.queryStringParameters.type;
    const input = event.queryStringParameters.input;
    const output = event.queryStringParameters.output;
    const conversation = event.queryStringParameters.conversation;
    const phone = event.queryStringParameters.phone;

    if (event.httpMethod === 'GET') {
        if (type === 'getairesponse') {
            const response = await getAIResponse(input);
            return getResponsePayload(response);

        } else if (type === 'getfirsttimes') {
            const response = await getFirstTimes(input);
            return getResponsePayload(response);

        } else {
            return log(`type "${type}" is not supported`);
        }

    } else if (event.httpMethod === 'POST') {
        if (type === 'setairesponse') {
            await setAIResponse(input, output);
            return getResponsePayload('Success!');

        } else if (type === 'sendconversation') {
            await sendConversation(conversation, phone);
            return getResponsePayload('Success!');

        } else {
            return log(`type "${type}" is not supported`);
        }

    } else if (event.httpMethod === 'DELETE') {
        await deleteAIResponse(input, output);
        return getResponsePayload('Success!');

    } else {
        return log(`event.httpMethod "${event.httpMethod}" is not supported`);
    }

};

async function getAIResponse(input) {
    const chineseBlacklistedWord = find(Chinese_Blacklist, (blacklistedWord) => input.replace(SymbolRegex, '').includes(blacklistedWord));
    if (chineseBlacklistedWord) {
        log(`Found Chinese blacklisted word "${chineseBlacklistedWord}"`);
        return getRandomFromList(Chinese_Blacklist_Response).replace(/{{blacklistedWord}}/g, chineseBlacklistedWord);
    }
    const englishBlacklistedWord = find(English_Blacklist, (blacklistedWord) => input.toLowerCase().replace(SymbolRegex, '').includes(blacklistedWord));
    if (englishBlacklistedWord) {
        log(`Found English blacklisted word "${englishBlacklistedWord}"`);
        return getRandomFromList(English_Blacklist_Response).replace(/{{blacklistedWord}}/g, englishBlacklistedWord);
    }

    let dynamodbResponses = await queryInput(input);

    if (isEmpty(dynamodbResponses)) {
        log(`DynamoDB response for input "${input}" is empty. Will look for the most similar question to input "${input}"`);
        const mostSimilarQuestion = await findMostSimilarQuestion(input);
        dynamodbResponses = await queryInput(mostSimilarQuestion);
    }

    return getRandomFromList(dynamodbResponses);
}

async function getFirstTimes(input) {
    return await queryInput(input);
}

async function setAIResponse(input, output) {
    const dynamodbResponses = await queryInput(input);
    const newResponses = uniq(dynamodbResponses.concat(output));

    return await updateInput(input, newResponses);
}

async function deleteAIResponse(input, output) {
    const dynamodbResponses = await queryInput(input);
    const newResponses = without(dynamodbResponses, output);

    if (isEmpty(newResponses)) {
        log(`DynamoDB response for input "${input}" is empty after deletion. Will delete the entry for input "${input}"`);
        return await deleteInput(input);
    }

    return await updateInput(input, newResponses);
}

async function queryInput(input) {
    const queryParams = {
        ExpressionAttributeValues: {
            ':v1': {
                S: input
            }
        },
        KeyConditionExpression: 'Question = :v1',
        ProjectionExpression: 'Answers',
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
            ':v1': {
                SS: newResponses
            }
        },
        Key: {
            'Question': {
                S: input
            }
        },
        UpdateExpression: 'SET Answers = :v1',
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

async function deleteInput(input) {
    const deleteParams = {
        Key: {
            'Question': {
                S: input
            }
        },
        TableName: 'Conversation'
    };
    await new Promise((resolve, reject) => {
        dynamodb.deleteItem(deleteParams, (error) => {
            if (error) {
                log(error);
                reject(error);
            }
            resolve();
        });
    });
    return log(`Dynamodb responses for input "${input}" were deleted`);
}

async function scanExistingQuestions() {
    const scanParams = {
        ProjectionExpression: 'Question',
        TableName: 'Conversation'
    };
    const existingQuestions = await new Promise((resolve, reject) => {
        dynamodb.scan(scanParams, (error, data) => {
            if (error) {
                log(error);
                reject(error);
            }
            const responses = data.Items.map((item) => item.Question.S);
            resolve(responses);
        });
    });
    log(`Found ${existingQuestions.length} existing questions from dynamodb`);
    return existingQuestions;
}

async function findMostSimilarQuestion(input) {
    const existingQuestions = await scanExistingQuestions();

    const sortedExistingQuestions = existingQuestions
        .map((question) => {
            return {
                question: question,
                editDistance: getEditDistance(question, input)
            };
        })
        .sort((a, b) => {return a.editDistance - b.editDistance;});

    const mostSimilarQuestion = sortedExistingQuestions[0].question;
    const smallestEditDistance = sortedExistingQuestions[0].editDistance;
    log(`Across all ${existingQuestions.length} existing questions, "${mostSimilarQuestion}" has the smallest edit distance (${smallestEditDistance}) to input "${input}"`);
    return mostSimilarQuestion;
}

// https://leetcode.com/problems/edit-distance/discuss/662447/JavaScript-simple-dp
function getEditDistance(w1, w2) {
    const l1 = w1.length;
    const l2 = w2.length;
    const dp = Array.from({length: l1+1}, () => Array.from({length: l2+1}));

    for (let row = 0; row <= l1; row++) dp[row][0] = row;
    for (let col = 0; col <= l2; col++) dp[0][col] = col;
    for (let row = 1; row <= l1; row++) {
        for (let col = 1; col <= l2; col++) {
            dp[row][col] = Math.min(
                dp[row-1][col] + 1,
                dp[row][col-1] + 1,
                dp[row-1][col-1] + ((w1[row-1] === w2[col-1]) ? 0 : 1)
            );
        }
    }

    return dp[l1][l2];
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

async function sendConversation(conversation, phone) {
    const _conversation = conversation.replace(/___/g, '\n');
    if (_conversation.length > 240) {
        return log('Cannot send conversation longer than 240 characters');
    }
    if (! /^\d{10}$/.test(phone)) {
        return log('Phone number must be 10 digits');
    }

    return await sendMessage(_conversation, `\+1${phone}`);
}

async function sendMessage(message, target) {
    const publishParams = {
        Message: message,
        PhoneNumber: target
    };
    await new Promise((resolve, reject) => {
        sns.publish(publishParams, (error) => {
            if (error) {
                log(error);
                reject(error);
            }
            resolve();
        });
    });
    return log(`Sent message "${message}" to target "${target}"`);
}

function getRandomFromList(list) {
    const randomIndex = random(list.length-1);
    const pickedValue = list[randomIndex];
    log(`Pick the ${randomIndex+1}-th value (${pickedValue}) from the list "${list}"`);
    return pickedValue;
}