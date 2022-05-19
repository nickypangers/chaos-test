/* eslint-disable */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sitemapApi = require("./api/sitemap");
const fighterApi = require("./api/fighters");
const moment = require("moment");

const db = admin.firestore();

// admin.initializeApp();

exports.getSitemap = functions.https.onRequest(async (req, res) => {
  try {
    const sitemaps = await sitemapApi.getSitemaps();

    res.status(200).send(sitemaps);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

exports.getFighterLastModInfo = functions.firestore
  .document("sitemaps/{sitemapId}")
  .onCreate(sitemapApi.saveFighterLastModInfoToDb);

exports.getFighterId = functions.firestore
  .document("last_mods/{lastModId}")
  .onCreate(fighterApi.getFighterId);

// exports.updateFighterData = functions.pubsub
//   .schedule("* * * * *")
//   .onRun(async (context) => {
//     await db.collection("test").doc(moment().toString()).set({
//       test: moment().toString(),
//     });
//   });

// exports.scheduledFunction = functions.pubsub
//   .schedule("every 2 minutes")
//   .onRun((context) => {
//     functions.logger.info("This will be run every 2 minutes!");
//     return null;
//   });

exports.getFighterData = functions.firestore
  .document("last_mods/{lastModId}")
  .onUpdate(async (change, context) => {
    const newVal = change.after.data();

    const now = moment().format("YYYY-MM-DD");
    if (newVal.lastmod === now) {
      if (newVal.updated) {
        return;
      }
    }

    try {
      await fighterApi.getFighterData(newVal.id);

      await db.collection("last_mods").doc(newVal.id).update({
        updated: true,
      });
    } catch (err) {
      functions.logger.error("Error getting fighter data:", err);
      return;
    }
  });

exports.getFighterLastModList = functions.https.onRequest(async (req, res) => {
  try {
    const last_modsRef = await db.collection("last_mods");

    last_modsRef.get().then((snapshot) => {
      const docs = [];

      snapshot.forEach((doc) => {
        docs.push(doc.data());
      });

      res.send(docs);
    });
  } catch (err) {
    functions.logger.error(err);
    res.status(500).send({ err: err.message });
  }
});

exports.getFighterIdNeedsToBeUpdated = functions.https.onRequest(
  async (req, res) => {
    try {
      const last_modsRef = await db.collection("last_mods");

      last_modsRef.get().then((snapshot) => {
        const docs = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.updated === false) {
            docs.push(data.id);
          }
        });

        res.send(docs);
      });
    } catch (err) {
      res.status(500).send({ success: false, err: err.message });
    }
  }
);

exports.checkFighterLastMod = functions.https.onRequest(async (req, res) => {
  try {
    let last_run_id = null;

    const last_runRef = await db.collection("last_run").doc("info").get();
    if (!last_runRef.exists) {
      await db.collection("last_run").doc("info").set({ id: null });
    } else {
      last_run_id = await last_runRef.data().id;
    }

    const last_modsRef = await db.collection("last_mods");

    last_modsRef.get().then(async (snapshot) => {
      // if (last_run_id !== null) {
      //   if (snapshot[snapshot.length - 1].data().id === last_run_id) {
      //     last_run_id = null;
      //   }
      // }

      const docs = [];

      snapshot.forEach((doc) => {
        docs.push(doc.data());
      });

      if (last_run_id !== null) {
        if (docs[docs.length - 1].id === last_run_id) {
          last_run_id = null;
        }
      }

      const startIndex =
        last_run_id == null ? 0 : docs.findIndex((x) => x.id === last_run_id);

      const endIndex = startIndex + 10;

      const checkingList = docs.slice(startIndex, endIndex);

      const neededUpdateList = checkingList.map((doc) => {
        if (doc.updated === false) {
          return doc.id;
        }
      });

      let checkedId = null;

      for (let i = 0; i < neededUpdateList.length; i++) {
        const id = neededUpdateList[i];
        checkedId = id;
        await fighterApi.getFighterData(id);
      }

      functions.logger.info(checkingList[checkingList.length - 1].id);

      await db
        .collection("last_run")
        .doc("info")
        .set({ id: checkingList[checkingList.length - 1].id });

      res.send({ success: true });
    });
  } catch (err) {
    functions.logger.error(err);
    res.status(500).send({ success: false, err: err.message });
  }
});
