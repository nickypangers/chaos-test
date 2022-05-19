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

exports.updateFighterLastMod = functions.https.onRequest(async (req, res) => {
  try {
    let last_run_id = null;

    const last_runsRef = await db.collection("last_runs").doc("sitemaps").get();
    if (!last_runsRef.exists) {
      await db.collection("last_runs").doc("sitemaps").set({ id: null });
    } else {
      last_run_id = await last_runsRef.data().id;
    }

    const sitemapsRef = await db.collection("sitemaps");
    sitemapsRef.get().then(async (snapshot) => {
      const sitemaps = [];
      snapshot.forEach((doc) => {
        sitemaps.push(doc.data());
      });

      if (last_run_id !== null) {
        if (sitemaps[sitemaps.length - 1].id === last_run_id) {
          last_run_id = null;
        }
      }

      const currentIndex =
        last_run_id === null
          ? 0
          : sitemaps.findIndex((doc) => doc.id === last_run_id);

      if (currentIndex === -1) {
        await db.collection("last_runs").doc("sitemaps").update({ id: null });
        res.status(500).send({ success: false, err: "No sitemap found" });
        return;
      }

      const toRunIndex =
        currentIndex + 1 === sitemaps.length ? 0 : currentIndex + 1;

      const toRunSitemap = sitemaps[toRunIndex];

      await sitemapApi.getFighterLastModInfo(toRunSitemap.url);

      await db
        .collection("last_runs")
        .doc("sitemaps")
        .update({ id: toRunSitemap.id });

      res.status(200).send({ success: true });
    });
  } catch (err) {
    res.status(500).send({ success: false, err: err.message });
  }
});

exports.updateFighterData = functions.https.onRequest(async (req, res) => {
  try {
    let last_run_id = null;

    const last_runsRef = await db
      .collection("last_runs")
      .doc("mma-fighters")
      .get();
    if (!last_runsRef.exists) {
      await db.collection("last_runs").doc("mma-fighters").set({ id: null });
    } else {
      last_run_id = await last_runsRef.data().id;
    }

    const last_modsRef = await db.collection("last_mods");
    last_modsRef.get().then(async (snapshot) => {
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

      for (let i = 0; i < neededUpdateList.length; i++) {
        const id = neededUpdateList[i];
        checkedId = id;
        await fighterApi.getFighterData(id);
      }

      functions.logger.info(checkingList[checkingList.length - 1].id);

      await db
        .collection("last_runs")
        .doc("mma-fighters")
        .set({ id: checkingList[checkingList.length - 1].id });

      res.send({ success: true });
    });
  } catch (err) {
    functions.logger.error(err);
    res.status(500).send({ success: false, err: err.message });
  }
});
