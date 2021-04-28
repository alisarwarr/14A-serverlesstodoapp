import * as cdk from '@aws-cdk/core';
//S3-BUCKET
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
//CODE-PIPELINE
import * as CodePipeline from '@aws-cdk/aws-codepipeline';
import * as CodePipelineAction from '@aws-cdk/aws-codepipeline-actions';
import * as CodeBuild from '@aws-cdk/aws-codebuild';

export class CdkPiplineBackendStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


//creating s3Bucket
    const bucket = new s3.Bucket(this, 'serverlesstodoapp-bucket', {
      versioned: true,
      websiteIndexDocument: 'index.html',
      publicReadAccess: true
    });
    const distribution = new cloudfront.Distribution(this, 'serverlesstodoapp-distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket)
      }
    });
    new s3deploy.BucketDeployment(this, 'serverlesstodoapp-website', {
      sources: [s3deploy.Source.asset('../gatsbyjs-frontend/public')],
      destinationBucket: bucket,
      distribution
    });
    new cdk.CfnOutput(this, 'serverlesstodoapp-domainname', {
      value: distribution.domainName
    });

    
//creating build    
    const s3Build = new CodeBuild.PipelineProject(this, 'serverlesstodoapp-build', {
      buildSpec: CodeBuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            "runtime-versions": {
              "nodejs": 12
            },
            commands: [
              'cd gatsbyjs-frontend',
              'npm install --force'
            ]
          },
          build: {
            commands: [
              'npm run build'
            ]
          }
        },
        artifacts: {
          'base-directory': './gatsbyjs-frontend/public',
          files: [
            '**/*'
          ]
        }
      }),
      environment: {
        buildImage: CodeBuild.LinuxBuildImage.STANDARD_3_0
      }
    });


//creating pipeline
    const pipline = new CodePipeline.Pipeline(this, 'serverlesstodoapp-pipeline', {
      crossAccountKeys: false,
      restartExecutionOnUpdate: true
    });
    const sourceOutput = new CodePipeline.Artifact();
    const s3Output = new CodePipeline.Artifact();
    //STAGE1
    pipline.addStage({
      stageName: 'FetchCode',
      actions: [
        new CodePipelineAction.GitHubSourceAction({
          actionName: 'checkout',
          owner: "alisarwarr",
          repo: "14A-serverlesstodoapp",
          branch: "main",
          oauthToken: cdk.SecretValue.plainText("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"),
          output: sourceOutput
        })
      ]
    });
    //STAGE2
    pipline.addStage({
      stageName: 'BuildCode',
      actions: [
        new CodePipelineAction.CodeBuildAction({
          actionName: 'cdkBuild',                                          
          project: s3Build,
          input: sourceOutput,
          outputs: [s3Output]
        })
      ]
    });
    //STAGE3
    pipline.addStage({
      stageName: 'DeployCode',
      actions: [
        new CodePipelineAction.S3DeployAction({
          actionName: 's3Deploy',
          input: s3Output,
          bucket: bucket
        })
      ]
    });
  }
}
