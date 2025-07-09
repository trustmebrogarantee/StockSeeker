import { Chart } from "./Chart";
import { DropArea } from "./DropArea";
import { IndexedDBStorage } from "./IndexedDBStorage";
import "./styles.css"; // Optional: Import a CSS file for styling

// Get the root element from index.html
const app = document.getElementById("app");
const chart = new Chart();
app.appendChild(chart.element());
const dropArea = new DropArea()

modeChangeSelect.addEventListener("change", (e) => {
  if (e.target.value === "train-ab-ex-patterns") {
    chart.enableMode("train-ab-ex-patterns");
  } else {
    chart.enableMode(null);
  }
});

const trainData = [];

trainAbExPaterns.addEventListener("click", (e) => {
  if (
    [
      "bearish-exhaustion",
      "bearish-absorption",
      "bullish-exhaustion",
      "bullish-absorption",
      "skip",
    ].includes(e.target?.value)
  ) {
    chart.nextTrainSituation(e.target.value);
  }
});

const CANDLES_DATA_KEY = "assetCandlestics";
const PRICE_LEVELS_DATA_KEY = "priceLevels";
const BID_ASK_KEY = "bidAsk";
const STREAKS_KEY = "streaks";
const VOLUME_PROFILES_KEY = "volumeProfiles";
const PRICE_ACTIONS_KEY = "priceActions";
const VOLATILITY_KEY = "volatility";
const EXTREMUM_KEY = "extremum";
const storage = new IndexedDBStorage();

const clusterKeys = {
  price: 0,
  volume: 1,
  bid: 2,
  ask: 3,
  volumeDelta: 4,
  position: 5,
  evaluation: 6,
  absorption: 7,
};

function clusterArrToObject(arr) {
  const obj = {};
  for (const key of Object.keys(clusterKeys)) obj[key] = arr[clusterKeys[key]];
  return obj;
}

const receiveMessage = async (msg) => {
  try {
    const { message } = JSON.parse(msg.data);
    if (message[CANDLES_DATA_KEY]) {
      console.log(message);
      await storage.setItem(CANDLES_DATA_KEY, msg.data);
      const assetCandlestics = message.assetCandlestics.map((candle) => ({
        ...candle,
        clusters: Object.fromEntries(
          candle.clusters.map((cluster) => [
            cluster[clusterKeys.price].toString(),
            clusterArrToObject(cluster),
          ])
        ),
      }));
      chart.renderData(assetCandlestics);
      chart.automateRenderingForData(assetCandlestics);
    } else if (message[PRICE_LEVELS_DATA_KEY]) {
      await storage.setItem(PRICE_LEVELS_DATA_KEY, msg.data);
      chart.setLevels(message.priceLevels);
    } else if (message[BID_ASK_KEY]) {
      await storage.setItem(BID_ASK_KEY, msg.data);
      chart.setBidAsk(message.bidAsk);
    } else if (message[STREAKS_KEY]) {
      await storage.setItem(STREAKS_KEY, msg.data);
      chart.setStreaks(message.streaks);
    } else if (message[VOLUME_PROFILES_KEY]) {
      await storage.setItem(VOLUME_PROFILES_KEY, msg.data);
      chart.setVolumeProfiles(message.volumeProfiles);
    } else if (message[PRICE_ACTIONS_KEY]) {
      await storage.setItem(PRICE_ACTIONS_KEY, msg.data);
      chart.setPriceActions(message.priceActions);
    } else if (message[VOLATILITY_KEY]) {
      await storage.setItem(VOLATILITY_KEY, msg.data);
      chart.setSma(message.volatility.sma);
      chart.setStdDev(message.volatility.stdDev);
    } else if (message[EXTREMUM_KEY]) {
      await storage.setItem(EXTREMUM_KEY, msg.data);
      chart.setHighs(message.extremum.highs);
      chart.setLows(message.extremum.lows);
    }
  } catch (err) {
    console.error(err);
  }
};

dropArea.on('file-drop', async (file) => {
  await receiveMessage({ data: file })
})

const startWebsocket = () => {
  let ws = new WebSocket("ws://localhost:9092");
  ws.onmessage = receiveMessage;
  ws.onopen = () => {
    console.log("ws reconnected", new Date().toLocaleTimeString());
  };
  ws.onclose = () => {
    ws = null;
    setTimeout(startWebsocket, 1000);
  };
  ws.onerror = (err) => {
    console.error(err);
  };
};

const retrieveSavedData = async () => {
  const candlesData = await storage.getItem(CANDLES_DATA_KEY);
  if (candlesData) receiveMessage({ data: candlesData });

  const priceLevelsData = await storage.getItem(PRICE_LEVELS_DATA_KEY);
  if (priceLevelsData) receiveMessage({ data: priceLevelsData });

  const bidAskData = await storage.getItem(BID_ASK_KEY);
  if (bidAskData) receiveMessage({ data: bidAskData });

  const streaksData = await storage.getItem(STREAKS_KEY);
  if (streaksData) receiveMessage({ data: streaksData });

  const volumeProfilesData = await storage.getItem(VOLUME_PROFILES_KEY);
  if (volumeProfilesData) receiveMessage({ data: volumeProfilesData });

  const priceActionsData = await storage.getItem(PRICE_ACTIONS_KEY);
  if (priceActionsData) receiveMessage({ data: priceActionsData });

  const volatilityData = await storage.getItem(VOLATILITY_KEY);
  if (volatilityData) receiveMessage({ data: volatilityData });

  const extremumData = await storage.getItem(EXTREMUM_KEY);
  if (extremumData) receiveMessage({ data: extremumData });
};
retrieveSavedData();
startWebsocket();

