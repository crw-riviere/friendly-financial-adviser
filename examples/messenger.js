'use strict';

// Messenger API integration example
// We assume you have:
// * a Wit.ai bot setup (https://wit.ai/docs/quickstart)
// * a Messenger Platform setup (https://developers.facebook.com/docs/messenger-platform/quickstart)
// You need to `npm install` the following dependencies: body-parser, express, request.
//
// 1. npm install body-parser express request
// 2. Download and install ngrok from https://ngrok.com/download
// 3. ./ngrok http 8445
// 4. WIT_TOKEN=your_access_token FB_APP_SECRET=your_app_secret FB_PAGE_TOKEN=your_page_token node examples/messenger.js
// 5. Subscribe your page to the Webhooks using verify_token and `https://<your_ngrok_io>/webhook` as callback URL.
// 6. Talk to your bot on Messenger!

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const request = require('request');
var storage = require('node-storage');

let Wit = null;
let log = null;
try {
  // if running from repo
  Wit = require('../').Wit;
  log = require('../').log;
} catch (e) {
  Wit = require('node-wit').Wit;
  log = require('node-wit').log;
}

// Webserver parameter
const PORT = process.env.PORT || 8445;

var mondo = require('mondo-bank');

var accountId = 'acc_000096SQdfcdJriLPzqSgL';
var accessTokenMondo = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaSI6Im9hdXRoY2xpZW50XzAwMDA5NFB2SU5ER3pUM2s2dHo4anAiLCJleHAiOjE0Nzk1NjQ3MTMsImlhdCI6MTQ3OTU0MzExMywianRpIjoidG9rXzAwMDA5RVZPUms4bFJyRlBOb2dudHgiLCJ1aSI6InVzZXJfMDAwMDk2RzlLZWswTERhMmpkaUdCZCIsInYiOiIyIn0.ajA-eZanjqogkmbE1-0mY-g-n-_nsymaVfxRk_5memI';
var PATH_TO_STORAGE = "budgets"

var store = new storage(PATH_TO_STORAGE);
store.put("testItem", 1000);

// Wit.ai parameters
const WIT_TOKEN =  "4L2APS7VUXE77KC7LZZ4MN32XQWW3ORT";

// Messenger API parameters
const FB_PAGE_TOKEN =  "EAAZAZAZAnPRdxwBANYF2HfQftU100dwPEHIc4BAvSLQUEUGM5XeSKnZAvY7w7ENQZBGZAv2EzYL5ZAeNlOQzfDpG73NJZBHzoRCVHMdafaCqoOcta7CsK2Mqx6yy9881SrTmFEvImBiUrp7CWvBFO5qbZBFrtFfm1lfZAqBQt991X0ZCAZDZD";
if (!FB_PAGE_TOKEN) { throw new Error('missing FB_PAGE_TOKEN') }
const FB_APP_SECRET =  "27ddc988a36cce305fdec513c6a918a8";
if (!FB_APP_SECRET) { throw new Error('missing FB_APP_SECRET') }

let FB_VERIFY_TOKEN = null;
crypto.randomBytes(8, (err, buff) => {
  if (err) throw err;
  FB_VERIFY_TOKEN = buff.toString('hex');
  console.log(`/webhook will accept the Verify Token "${FB_VERIFY_TOKEN}"`);
});

// ----------------------------------------------------------------------------
// Messenger API specific code

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference

const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

// ----------------------------------------------------------------------------
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

// Our bot actions
const actions = {
  send({sessionId}, {text}) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      // We return a promise to let our bot know when we're done sending
      return fbMessage(recipientId, text)
      .then(() => null)
      .catch((err) => {
        console.error(
          'Oops! An error occurred while forwarding the response to',
          recipientId,
          ':',
          err.stack || err
        );
      });
    } else {
      console.error('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      return Promise.resolve()
    }
  },
  getBalance({context, entities}) {
    return new Promise(function (resolve, reject) {
      mondo['balance'](accountId, accessTokenMondo, function (error, value) {
        if (!error) {
          context.currentBalance = value.balance;
          return resolve(context);
        }
        else {
          console.log(error);
        }
      });
    });
  },
   getSpending({context, entities}) {
    delete context.currentBalance;
    return new Promise(function (resolve, reject) {
      var spendingCategory = firstEntityValue(entities, 'search_query')

      context.spendings = '$12121 on ' + spendingCategory;
      return resolve(context);
    });
  },
  getBiggestSpending({context, entities}) {
    delete context.currentBalance;
    return new Promise(function (resolve, reject) {

      var param = {
        account_id: accountId,
        since: '2016-10-01T23:00:00Z'
      };

      function groupTransactions(transactionsResponse) {

        var categories = [];
        var transactions = transactionsResponse.transactions;

        for (var i = 0; i < transactions.length; i++) {

          var transactionCategory = transactions[i]["category"];
          var transactionAmount = transactions[i]["amount"];
          if (categories[transactionCategory] == undefined) {
            categories[transactionCategory] = 0;
          }
          categories[transactionCategory] += transactionAmount;
        }

        console.log(categories);
        return categories;
      };

      function poundify(whole_penny_amount) {
        return 0 - (whole_penny_amount / 100);
      }

      function sortCategories(categories) {
        var result = [];
        for (var category in categories.sort()) {
          var objCategory = {
            "name": category,
            "amount": categories[category]
          }
          console.log(objCategory);
          result.push(objCategory);
        }

        console.log(result);
        return result;
      };

      mondo['transactions'](param, accessTokenMondo, function (error, value) {
        if (!error) {
          console.log("done fetching transactions");
          var topSpendingCategories = groupTransactions(value);

          var sorted = sortCategories(topSpendingCategories);


          var categoryRankRequested = 0
          if (categoryRankRequested == undefined) {
            categoryRankRequested = 0;
          }

          context.spendings = "You have spent £" + poundify(sorted[categoryRankRequested].amount) + " on " + sorted[categoryRankRequested].name + " this month.";
          return resolve(context);


        }
        else {
          console.log(error);

        }
      });



    });
  },
    setBudget({context, entities}){
    return new Promise(function(resolve, reject) {
      console.log(entities)
      var budgetType = entities.search_query[0].value;
      var budgetLimit = entities.number[0].value;

      store.put(budgetType, budgetLimit);

      return resolve(context);
    });


  },
  getBudget({context, entities}) {
    return new Promise(function(resolve, reject) {
      var budget = store.get(entities.search_query[0].value);
      context.budgetSpend = budget;
      return resolve(context);
    });
  },
};

// Setting up our bot
const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});

// Starting our webserver and putting it all together
const app = express();
app.use(({method, url}, rsp, next) => {
  rsp.on('finish', () => {
    console.log(`${rsp.statusCode} ${method} ${url}`);
  });
  next();
});
app.use(bodyParser.json({ verify: verifyRequestSignature }));

// Webhook setup
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});


app.post('/monzowebhook', (req,res) => {
  //  var queryString = req.url.substring(req.url.indexOf("?") + 1, req.url.length);
  //   var queryStringParsed = qs.parse(queryString);

    // console.log(queryStringParsed);
    var transaction = req.body.data;
console.log(transaction);

    var params = {
        account_id: accountId,
        params: {
            title: `Slavo, You've exceded your budget!`,
            body: `You spent ${transaction.amount} at ${transaction.description} which has pushed you over your budget`,
            image_url: 'http://downloadicons.net/sites/default/files/alert-icon-54871.png'
        },
        url: 'www.google.co.uk'
    };

    mondo.createFeedItem(params, accessTokenMondo).then(function (error, value) {
        res.end("OK");
    })
    .catch(function (error) {
        console.log(error);
        res.end("Error");
    });
});


// Message handler
app.post('/webhook', (req, res) => {
  // Parse the Messenger payload
  // See the Webhook reference
  // https://developers.facebook.com/docs/messenger-platform/webhook-reference
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message && !event.message.is_echo) {
          // Yay! We got a new message!
          // We retrieve the Facebook user ID of the sender
          const sender = event.sender.id;

          // We retrieve the user's current session, or create one if it doesn't exist
          // This is needed for our bot to figure out the conversation history
          const sessionId = findOrCreateSession(sender);

          // We retrieve the message content
          const {text, attachments} = event.message;

          if (attachments) {
            // We received an attachment
            // Let's reply with an automatic message
            fbMessage(sender, 'Sorry I can only process text messages for now.')
            .catch(console.error);
          } else if (text) {
            // We received a text message

            // Let's forward the message to the Wit.ai Bot Engine
            // This will run all actions until our bot has nothing left to do
            wit.runActions(
              sessionId, // the user's current session
              text, // the user's message
              sessions[sessionId].context // the user's current session state
            ).then((context) => {
              // Our bot did everything it has to do.
              // Now it's waiting for further messages to proceed.
              console.log('Waiting for next user messages');

              // Based on the session state, you might want to reset the session.
              // This depends heavily on the business logic of your bot.
              // Example:
              // if (context['done']) {
              //   delete sessions[sessionId];
              // }

              // Updating the user's current session state
              sessions[sessionId].context = context;
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wit: ', err.stack || err);
            })
          }
        } else {
          console.log('received event', JSON.stringify(event));
        }
      });
    });
  }
  res.sendStatus(200);
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

app.listen(PORT);
console.log('Listening on :' + PORT + '...');
