import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as CdkAppsyncEventbridgeSnsStepfunctionsBackend from '../lib/cdk-appsync-eventbridge-sns-stepfunctions-backend-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new CdkAppsyncEventbridgeSnsStepfunctionsBackend.CdkAppsyncEventbridgeSnsStepfunctionsBackendStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
