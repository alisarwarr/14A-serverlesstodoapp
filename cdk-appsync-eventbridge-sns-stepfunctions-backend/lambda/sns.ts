const AWS = require('aws-sdk');
const sns = new AWS.SNS({ region: process.env.REGION });

import { PayloadType } from './dynamodb';

exports.handler = async(event: PayloadType) => {
    console.log("snsHandler event", event);


    //quit from here
    if (!event.operationSuccessful) {
        return { message: "operation not successful" }
    }
    //otherwise goes


    var paramsTopic = {
        Message: event.SnsMessage,
        TopicArn: process.env.SNS_TOPIC_ARN
    }

    var paramsPhone = {
        Message: event.SnsMessage,
        PhoneNumber: process.env.PHONE_NUMBER
    }

    try {
        //send message to TOPIC
        await sns.publish(paramsTopic).promise();
        console.log('message published');

        //send message to PHONE
        await sns.publish(paramsPhone).promise();
        console.log('message sent to PHONE: ', process.env.PHONE_NUMBER);
    }
    catch (err) {
        console.error('ERROR publish to SNS ====> ', JSON.stringify(err, null, 2));
        throw new Error(err.message);
    }

    return { message: "operation successful" }
}
