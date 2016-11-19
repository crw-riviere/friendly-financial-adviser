'use strict';

let Wit = null;
let interactive = null;
var mondo = require('mondo-bank');

var accountId = 'acc_000096SQdfcdJriLPzqSgL';
var accessTokenMondo = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaSI6Im9hdXRoY2xpZW50XzAwMDA5NFB2SU5ER3pUM2s2dHo4anAiLCJleHAiOjE0Nzk1NjQ3MTMsImlhdCI6MTQ3OTU0MzExMywianRpIjoidG9rXzAwMDA5RVZPUms4bFJyRlBOb2dudHgiLCJ1aSI6InVzZXJfMDAwMDk2RzlLZWswTERhMmpkaUdCZCIsInYiOiIyIn0.ajA-eZanjqogkmbE1-0mY-g-n-_nsymaVfxRk_5memI';


try {
  // if running from repo
  Wit = require('../').Wit;
  interactive = require('../').interactive;
} catch (e) {
  Wit = require('node-wit').Wit;
  interactive = require('node-wit').interactive;
}

const accessToken = (() => {
  // if (process.argv.length !== 3) {
  //   console.log('usage: node examples/quickstart.js <wit-access-token>');
  //   process.exit(1);
  // }
  // return process.argv[2];
  return "4L2APS7VUXE77KC7LZZ4MN32XQWW3ORT";
})();

// Quickstart example
// See https://wit.ai/ar7hur/quickstart

const firstEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
    ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};

const actions = {
  send(request, response) {
    const {sessionId, context, entities} = request;
    const {text, quickreplies} = response;
    return new Promise(function (resolve, reject) {
      console.log('sending...', JSON.stringify(response));
      return resolve();
    });
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
};

const client = new Wit({ accessToken, actions });
interactive(client);