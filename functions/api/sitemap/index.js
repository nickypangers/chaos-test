/* eslint-disable */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const parseString = require("xml2js").parseString;
const axiosRetry = require("axios-retry");

axiosRetry(axios, { retries: 3, retryDelay: () => 500 });

admin.initializeApp();

const db = admin.firestore();

const baseUrl = "https://www.tapology.com";
const acceptXmlHeaders = {
  headers: { Accept: "Application/xml" },
};
const fightersRegex =
  /https:\/\/www\.tapology\.com\/fightcenter\/fighters\/sitemap/;

const getSitemaps = async () => {
  try {
    const response = await axios.get(
      baseUrl + "/sitemap.xml",
      acceptXmlHeaders
    );

    if (response.status !== 200) {
      functions.logger.error(response.responseText);
      return;
    }

    const urlList = [];

    parseString(response.data, async (err, result) => {
      if (err) {
        functions.logger.error(err);
        return;
      }

      const urls = result.sitemapindex.sitemap;
      urls.forEach((url) => {
        if (fightersRegex.test(url.loc[0])) {
          urlList.push(url.loc[0]);
        }
      });
    });

    for (let i = 0; i < 1; i++) {
      // for (let i = 0; i < urlList.length; i++) {
      const url = urlList[i];
      const urlArray = url.split("/");
      const index = urlArray.indexOf("fighters");
      const sitemapId = urlArray[index + 1];

      await db.collection("sitemaps").doc(sitemapId).set({
        url: url,
      });
    }

    return urlList;
  } catch (err) {
    functions.logger.error(err);
    return;
  }
};

const getFighterLastModInfoFromSource = async (info) =>
  new Promise(async (resolve, reject) => {
    try {
      const lastmod = info.lastmod[0];
      const url = info.loc[0];
      const urlArray = url.split("/");
      const index = urlArray.indexOf("fighters");
      const id = urlArray[index + 1];

      const data = {
        id,
        lastmod,
        url,
        updated: false,
      };

      const doc = await db.collection("last_mods").doc(id).get();
      if (!doc.exists) {
        await db.collection("last_mods").doc(id).set(data);
      } else {
        if (doc.data().lastmod !== lastmod) {
          await db.collection("last_mods").doc(id).update({
            lastmod,
            update: false,
          });
        }
      }

      resolve(true);
    } catch (err) {
      reject(err);
    }
  });

const getFighterLastModInfo = async (url) => {
  try {
    const response = await axios.get(url, acceptXmlHeaders);

    if (response.status !== 200) {
      functions.logger.error(response.responseText);
      return;
    }

    parseString(response.data, async (err, result) => {
      if (err) {
        functions.logger.error(err);
        return;
      }

      const infos = result.urlset.url;

      for (let i = 0; i < 2; i++) {
        const infoSelection = infos.slice(i * 10, (i + 1) * 10);
        const promises = infoSelection.map((info) =>
          getFighterLastModInfoFromSource(info)
        );

        Promise.all(promises);
      }
    });
  } catch (err) {
    functions.logger.error(err);
    return;
  }
};

const saveFighterLastModInfoToDb = async (snap, context) => {
  const newVal = snap.data();

  try {
    await getFighterLastModInfo(newVal.url);
  } catch (err) {
    functions.logger.error(err);
    return;
  }
};

module.exports = {
  getSitemaps,
  saveFighterLastModInfoToDb,
};
