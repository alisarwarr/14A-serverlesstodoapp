import * as cdk from '@aws-cdk/core';
import * as ddb from '@aws-cdk/aws-dynamodb';
import * as lambda from '@aws-cdk/aws-lambda';
//APPSYNC
import * as appsync from '@aws-cdk/aws-appsync';
//EVENTBRIDGE
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
//IAM
import { Effect, PolicyStatement, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
//SNS
import * as sns from '@aws-cdk/aws-sns';
import * as subscriptions from '@aws-cdk/aws-sns-subscriptions';
//STEPFUNCTIONS
import * as stepFunctions from '@aws-cdk/aws-stepfunctions';
import * as stepFunctionsTasks from '@aws-cdk/aws-stepfunctions-tasks';
//VTL-REQUEST-RESPONSE
import { requestTemplate, responseTemplate } from '../utils/appsync-request-response';

export class CdkAppsyncEventbridgeSnsStepfunctionsBackendStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);



    //APPSYNC's API gives you a graphqlApi with apiKey ( for deploying APPSYNC )
    const api = new appsync.GraphqlApi(this, 'graphlApi', {
      name: 'serverlesstodoapp-api',
      schema: appsync.Schema.fromAsset('graphql/schema.gql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY
        }
      }
    });



    //creating HTTPdatasource ( that will put our event to the eventbus )
    const http_datasource = api.addHttpDataSource('serverlesstodoapp-ds',
      //ENDPOINT for eventbridge
      `https://events.${this.region}.amazonaws.com/`,
      {
        name: 'httpDsWithEventBridge',
        description: 'From Appsync to Eventbridge',
        authorizationConfig: {
          signingRegion: this.region,
          signingServiceName: 'events'
        }
      }
    );
    //giving permissions for HTTPdatasource
    events.EventBus.grantPutEvents(http_datasource);



    //mutations
    const mutations = ["createTodo", "deleteTodo", "updateTodo"];
    mutations.forEach((thatMutation) => {
      let details = `\\\"id\\\": \\\"$ctx.args.id\\\"`;

      if(thatMutation === "createTodo" || thatMutation === "updateTodo") {
        details = `\\\"id\\\":\\\"$ctx.args.id\\\", \\\"detail\\\":\\\"$ctx.args.detail\\\"`;
      }
      
      //describing resolver for db_datasource ( for send data to dynamoDB )
      http_datasource.createResolver({
        typeName: "Mutation",
        fieldName: thatMutation,
        requestMappingTemplate: appsync.MappingTemplate.fromString(requestTemplate(details, thatMutation)),
        responseMappingTemplate: appsync.MappingTemplate.fromString(responseTemplate()),
      });
    });



    //creating lambdafunctions
    const dynamodbLambda = new lambda.Function(this, 'serverlesstodoapp-dynamodbLambda', {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'dynamodb.handler'
    });
    


//**************************DYNAMODB**************************/
    //creating table
    const myTable = new ddb.Table(this, 'serverlesstodoapp-table', {
      partitionKey: {                                         //like unique primarykey for record indentification
        name: 'id',
        type: ddb.AttributeType.STRING
      }
    });
    //for give access to lambdafunction ( to get data from dynamoDB's table )
    myTable.grantReadWriteData(dynamodbLambda);
    //for tell lambdafunction ( that this named table consider for storing )
    dynamodbLambda.addEnvironment('TABLE_NAME', myTable.tableName);    
//**************************DYNAMODB**************************/



    //setting table as a datasource of endpoint
    const db_datasource = api.addDynamoDbDataSource('DBDataSource', myTable);
    //describing resolver for db_datasource ( for get data from dynamoDB )
    db_datasource.createResolver({
      typeName: "Query",
      fieldName: "allTodos",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList()
    });
    

    
//**************************SNS**************************/ 
    //create an SNS topic ( for like send topic )
    const snsTopic = new sns.Topic(this, 'serverlesstodoapp-snsTopic');

    const phoneNumber = "+923353089102";

    //following command subscribes our email & phone to the SNS topic ( whenever a topics comes then goes to phone )
    snsTopic.addSubscription(
      new subscriptions.SmsSubscription(phoneNumber)
    );
//**************************SNS**************************/



//*********************ROLES SNSLAMBDA**********************/
    //create a specific role for Lambda function ( emptyrole )
    const role = new Role(this, 'LambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com') //choosing lambda here for assigning role
    });

    //giving sns:publish access to lambda    
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,                                   //for allowing below mentioned services
      actions: ["SNS:Publish", "logs:*", "ses:SendEmail"],    //giving rights of all services
      resources: ['*']
    });

    //granting IAM permissions to role ( not emptyrole )
    role.addToPolicy(policy);
//*********************ROLES SNSLAMBDA**********************/



    //creating lambdafunctions
    const snsLambda = new lambda.Function(this, 'serverlesstodoapp-snsLambda', {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'sns.handler',
      environment : {                                         //setting Environment Variables
        SNS_TOPIC_ARN: snsTopic.topicArn,
        PHONE_NUMBER: phoneNumber,
        REGION: this.region
      },
      //giving role
      role: role
    });


    
//*********************STEPFUNCTIONS**********************/
    //creating step of stepfunction
    const step1 = new stepFunctionsTasks.LambdaInvoke(
      this,
      "Invoke dynamodbLambda",
      {
        lambdaFunction: dynamodbLambda
      }
    );
    const step2 = new stepFunctionsTasks.LambdaInvoke(
      this,
      "Invoke snsLambda",
      {
        lambdaFunction: snsLambda,
        inputPath: "$.Payload"                                //$.payload sends entire data which passed from previous step
      }
    );

    //creating chain ( to define the sequence of execution )
    const chain = stepFunctions.Chain
    .start(step1)
    .next(step2);

    //creating statemachine
    const stepFnStateMachine = new stepFunctions.StateMachine(this, 'serverlesstodoapp-stateMachine', {
      definition: chain
    });
//*********************STEPFUNCTIONS**********************/



    //rule fire by default event bus has target statemachine
    const rule = new events.Rule(this, 'appsyncEventbridgeRule', {
      ruleName: 'serverlesstodoapp-appsyncEventbridgeRule',
      description: 'created for appSyncEventbridge',
      eventPattern: {
        source: ["serverlesstodoapp-events"],
        //every event that has source = "serverlesstodoapp-events" will be sent to our lambda
      },
      targets: [new targets.SfnStateMachine(stepFnStateMachine)]
    });
  }
}
