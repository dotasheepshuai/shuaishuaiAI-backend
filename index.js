exports.handler = async (event) => {
    const input = event.queryStringParameters.input;
    const output = await getAIResponse(input);
    return getResponsePayload(output);
};

async function getAIResponse(input) {
    return input.replace(/\?/g, '!');
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