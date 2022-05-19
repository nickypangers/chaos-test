/* eslint-disable */
const functions = require("firebase-functions");
const cheerio = require("cheerio");
const axios = require("axios");
const admin = require("firebase-admin");

const db = admin.firestore();

const getFighterId = async (snap, context) => {
  const newVal = snap.data();

  const url = newVal.url;

  try {
    const response = await axios.get(url);

    if (response.status !== 200) {
      throw new Error(response.responseText);
    }

    const $ = cheerio.load(response.data);
    const fid = $('meta[name="fid"]').attr("content");

    await db.collection("last_mods").doc(newVal.id).update({
      fid,
    });
  } catch (err) {
    functions.logger.error(err);
  }
};

const getSalt = async (url) => {
  try {
    const response = await axios.get(url);

    if (response.status !== 200) {
      throw new Error(response.responseText);
    }

    const $ = cheerio.load(response.data);
    const salt = $('meta[name="salt"]').attr("content");
    return salt;
  } catch (err) {
    throw new Error(err);
  }
};

const getFighterData = async (id) => {
  try {
    const doc = await (await db.collection("last_mods").doc(id).get()).data();

    const salt = getSalt(doc.url);

    const fid = doc.fid;

    const response = await axios.get(
      `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEEAPIKEY}&render_js=false&forward_headers=true&url=https://api.tapology.com/v1/internal_fighters/${salt}${fid}`,
      {
        headers: {
          "Scn-authorization": `Bearer ${process.env.TAPOLOGYTOKEN}`,
          "Scn-content-type": "application/vnd.api+json",
        },
      }
    );

    if (response.status !== 200) {
      functions.logger.error(response.responseText);
      return;
    }

    await db.collection("mma-fighters").doc(id).set(response.data);
  } catch (err) {
    functions.logger.error(err);
  }
};

module.exports = {
  getFighterId,
  getFighterData,
};
