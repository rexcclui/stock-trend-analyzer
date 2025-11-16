install AWS CLI
# For macOS
brew install awscli

# For Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# For Windows
# Download and run: https://awscli.amazonaws.com/AWSCLIV2.msi

# Verify installation
aws --version



# For macOS
brew install aws-sam-cli

# For Linux
wget https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip
unzip aws-sam-cli-linux-x86_64.zip -d sam-installation
sudo ./sam-installation/install

# For Windows
# Download and run: https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi

# Verify installation
sam --version


# For macOS
brew install openjdk@17
brew install maven

# For Linux (Ubuntu/Debian)
sudo apt update
sudo apt install openjdk-17-jdk maven

# Verify installation
java -version
mvn -version



aws configure


# Check your credentials are working
aws sts get-caller-identity


 sam deploy --guided


Key                 AnalyzeEndpoint                                                                                                     
Description         Analyze Stock Endpoint                                                                                              
Value               https://8i8590b7nf.execute-api.eu-west-1.amazonaws.com/prod/analyze                                                 

Key                 BacktestEndpoint                                                                                                    
Description         Backtest Endpoint                                                                                                   
Value               https://8i8590b7nf.execute-api.eu-west-1.amazonaws.com/prod/backtest                                                

Key                 StockAnalyzerApiUrl                                                                                                 
Description         API Gateway endpoint URL                                                                                            
Value               https://8i8590b7nf.execute-api.eu-west-1.amazonaws.com/prod/   


CloudFormation Stack (main dashboard):

https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks
Lambda Functions:

https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions
API Gateway:

https://console.aws.amazon.com/apigateway/home?region=us-east-1#/apis
CloudWatch Logs:

https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups