# Trivia

A trivia game for Circuit written with [Google Cloud Functions](https://cloud.google.com/functions/docs/), [Google Cloud Datastore](https://cloud.google.com/datastore/docs/), [DialogFlow](https://dialogflow.com/docs) and the [Circuit REST API](https://circuitsandbox.net/rest/v2/swagger/ui/index.html).

## Usage
Add the trivia bot to a conversation. Then any participant can ask the bot to post a new trivia question, list the categories, show the stats and more.

For example: <i><a href="">@Trivia Bot</a> ask an easy question in sports</i>

Any participant can answer the posted question. After 20 seconds the correct answer and the winners are shown.

### Screenshots
<kbd><img src="images/question.png" width="425px"></kbd>
<kbd><img src="images/question2.png" width="425px"></kbd>
<kbd><img src="images/answer.png" width="425px"></kbd>
<kbd><img src="images/stats.png" width="425px"></kbd>
<kbd><img src="images/categories.png" width="425px"></kbd>

## Technical Overview
The cloud functions <b>start</b> and <b>stop</b> are used to register/unregister the Circuit webhooks <code>CONVERSATION.ADD_ITEM</code> and <code>USER.SUBMIT_FORM_DATA</code> via the Circuit REST API.

The cloud function <b>webhook</b> is called whenever a text item is posted in a conversation the bot is a member of. This function checks if the bot is mentioned, and if so passes the text content (utterance) to DialogFlow via the [DialogFlow SDK](https://dialogflow.com/docs/sdks). The official [DialogFlow Node.js Client](https://www.npmjs.com/package/dialogflow) is used.

DialogFlow then returns the matched intent. The category and difficulty are provided to the function if DialogFlow  was able to recognize them.

If the intent is <b>New Question</b> the cloud function performs a REST API call to [opentdb.com](https://opentdb.com/api.php) to find a corresponding question. If the user does not specify a difficulty and category, random values are used.

The cloud function then posts the question in the conversation using the new Circuit SDK Forms feature, and adds the question to Cloud Datastore.

When a user submits an answer the same cloud function <b>webook</b> is called. If the timeout hasn't been reached and the user hasn't already submitted an answer to this question, then the submission is added to Cloud Datastore.

After the 20s timeout, the <b>webhook</b> function looks up the submissions and posts a reply with the correct answer and the winners.

The <b>webhook</b> cloud function also handles the intents to show statistics and to list the categories.


## Run locally for development

### Prerequisites
* [Cloud Function Emulator](https://cloud.google.com/functions/docs/emulator) to run the functions locally
* [Cloud Datastore Emulators](https://cloud.google.com/datastore/docs/tools/datastore-emulator) to store the data locally
* [ngrok](https://ngrok.com/) or a similar tool is required to expose your local functions as public URLs so they can be registered for Circuit webhooks

### Deploy locally
Follow the same steps as in cloud deploy below. If you followed the emulator installation steps above, the deployment will be to your local emulators.

* <code>gcloud beta emulators datastore start</code>
* export the env variables, e.g. <code>export DOMAIN=https://circuitsandbox.net</code>
* <code>functions config set projectId &lt;your project id></code>
* <code>functions start</code>
* <code>functions deploy start --runtime nodejs8 --env-vars-file .env.yaml --trigger-http</code>
* <code>functions deploy stop --runtime nodejs8 --env-vars-file .env.yaml --trigger-http</code>
* <code>functions deploy webhook --runtime nodejs8 --env-vars-file .env.yaml --trigger-http</code>

### Debugging
Use vscode to debug, but before starting the debugger you need to start the functions emulator debugger via <code>functions inspect webhook</code> for debugging the webhook function.

## Deploy to Google Cloud

### Prerequisites
* gcloud account with billing enabled

### Deploy
1. Create gcloud project and enable the [Cloud Functions API](https://console.cloud.google.com/functions)
1. Clone this repo
1. Authorize gcloud to access the Cloud Platform via: <code>gcloud auth login</code>
1. Set the project via: <code>gcloud config set project my-trivia-game</code> (where my-trivia-game is your project name)
1. Setup a service account for authenticating the cloud APIs
https://cloud.google.com/docs/authentication/getting-started
1. Create a [dialogFlow](https://console.dialogflow.com) project and import trivia.zip
1. Rename <code>.env.yaml.template</code> to <code>.env.yaml</code> and update it with your configuration
1. Deploy the Datastore indexes via: <code>gcloud app deploy index.yaml</code>
1. Deploy the functions via: <code>cd manage;gcloud beta functions deploy start --runtime nodejs8 --env-vars-file ../.env.yaml --trigger-http</code>
1. Deploy the remaining functions in the same way
1. Navigate to the start function to register the webhooks, e.g. https://us-central1-my-trivia-game.cloudfunctions.net/start



