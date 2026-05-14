const express = require("express");
const Route = require("../models/route");
const Truck = require("../models/truck");
const MergeablePair = require("../models/mergeablePair");
const { companyAuth } = require("../middlewares/auth");
const {
  hasGeminiConfig,
  generateGeminiResponse,
  generateGeminiJson,
} = require("../utils/geminiClient");
const { getIndianLocationCoordinates } = require("../data/indianLocations");

const aiRouter = express.Router();

const APP_CHAT_SYSTEM_PROMPT = `
You are the CargoMatch assistant for this exact app UI.

Follow this navigation map exactly:

Public top navbar (visible to everyone):
- About -> homepage section link "/#about"
- Features -> homepage section link "/#feature"
- Contact Us -> homepage section link "/#contact"
- Login -> "/login" (only shown when logged out)

Auth screens:
- Login page: "/login"
- Sign up page: "/signup"

After login:
- User must click the profile avatar in the top-right navbar.
- Avatar dropdown options:
  - Profile -> "/profile"
  - Add Truck -> "/truck"
  - Add Route -> "/route"
  - View Trucks -> "/view-trucks"
  - View Routes -> "/view-routes"
  - Mergeable Routes -> "/mergeable"
  - Logout

Additional routes:
- Admin dashboard -> "/admin" (for admin users)
- Privacy Policy -> "/privacy"
- Terms of Service -> "/terms"

Rules:
- Give click-by-click steps using the exact labels above.
- Do not invent labels like "Fleet Management", "Add Vehicle", or menus not listed here.
- If a feature is not in this map, say it is not currently available in the UI and suggest the closest available option.
- Keep answers concise, practical, and safe.
- If asked for private data, credentials, or secrets, refuse and suggest contacting support.
`;

const toRadians = (value) => (value * Math.PI) / 180;

const haversineDistanceKm = (pointA, pointB) => {
  if (
    !pointA ||
    !pointB ||
    !Number.isFinite(pointA.lat) ||
    !Number.isFinite(pointA.lng) ||
    !Number.isFinite(pointB.lat) ||
    !Number.isFinite(pointB.lng)
  ) {
    return 0;
  }
  const earthRadiusKm = 6371;
  const dLat = toRadians(pointB.lat - pointA.lat);
  const dLng = toRadians(pointB.lng - pointA.lng);
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const computeRouteDistanceKm = (source, stops = []) => {
  const sequence = [source, ...stops].filter(Boolean);
  if (sequence.length < 2) return 0;
  let totalDistance = 0;
  for (let i = 1; i < sequence.length; i += 1) {
    const previousCoords = getIndianLocationCoordinates(sequence[i - 1]);
    const currentCoords = getIndianLocationCoordinates(sequence[i]);
    totalDistance += haversineDistanceKm(previousCoords, currentCoords);
  }
  return Number(totalDistance.toFixed(1));
};

const scorePair = ({
  truckOne,
  truckTwo,
  truckOneSource,
  truckTwoSource,
  truckOneStops,
  truckTwoStops,
}) => {
  const stopSetOne = new Set(truckOneStops);
  const stopSetTwo = new Set(truckTwoStops);
  const commonStops = truckOneStops.filter((stop) => stopSetTwo.has(stop)).length;
  const combinedStops = new Set([...truckOneStops, ...truckTwoStops]).size;
  const overlapRatio = combinedStops === 0 ? 0 : commonStops / combinedStops;

  const biggerTruck =
    truckOne.totalCapacity >= truckTwo.totalCapacity ? truckOne : truckTwo;
  const smallerTruck = biggerTruck._id.toString() === truckOne._id.toString() ? truckTwo : truckOne;
  const biggerStops = biggerTruck._id.toString() === truckOne._id.toString() ? truckOneStops : truckTwoStops;
  const smallerStops =
    biggerTruck._id.toString() === truckOne._id.toString() ? truckTwoStops : truckOneStops;

  const isSubset = smallerStops.every((stop) => biggerStops.includes(stop));

  let capacityViolations = 0;
  smallerStops.forEach((stop) => {
    const biggerStopIndex = biggerStops.indexOf(stop);
    const smallerStopIndex = smallerStops.indexOf(stop);
    if (biggerStopIndex < 0 || smallerStopIndex < 0) return;

    const biggerRemaining = biggerTruck.remainingLoad?.[biggerStopIndex] ?? 0;
    const smallerLoad = smallerTruck.currentLoad?.[smallerStopIndex] ?? 0;
    if (biggerRemaining < smallerLoad) {
      capacityViolations += 1;
    }
  });

  const capacityFit = capacityViolations === 0 ? 1 : 0;
  const routeReduction = (truckOneStops.length + truckTwoStops.length - combinedStops) / 10;
  const subsetBonus = isSubset ? 0.2 : 0;
  const routeOneDistanceKm = computeRouteDistanceKm(truckOneSource, truckOneStops);
  const routeTwoDistanceKm = computeRouteDistanceKm(truckTwoSource, truckTwoStops);
  const combinedDistanceKm = routeOneDistanceKm + routeTwoDistanceKm;
  const potentialDistanceSavingsKm = Number(
    (Math.min(routeOneDistanceKm, routeTwoDistanceKm) * overlapRatio).toFixed(1)
  );
  const distanceEfficiency =
    combinedDistanceKm > 0 ? potentialDistanceSavingsKm / combinedDistanceKm : 0;
  const score =
    overlapRatio * 0.5 +
    capacityFit * 0.25 +
    routeReduction +
    subsetBonus +
    distanceEfficiency * 0.25;
  const savingsPercent =
    combinedDistanceKm > 0
      ? Number(((potentialDistanceSavingsKm / combinedDistanceKm) * 100).toFixed(1))
      : Math.max(commonStops * 7, 5);

  return {
    score: Number(score.toFixed(2)),
    overlapRatio: Number(overlapRatio.toFixed(2)),
    capacityFit: Boolean(capacityFit),
    isSubset,
    commonStops,
    combinedStops,
    routeOneDistanceKm,
    routeTwoDistanceKm,
    potentialDistanceSavingsKm,
    savingsEstimate: `${Math.max(savingsPercent, 5)}%`,
    savingsType: "Estimated distance/fuel saving from overlapping city segments",
  };
};

const getCompanyRouteData = async (companyId) => {
  const trucks = await Truck.find({ companyId });
  if (!trucks.length) return [];

  const truckIds = trucks.map((truck) => truck._id);
  const routes = await Route.find({ truckId: { $in: truckIds } });
  const routeMap = new Map(routes.map((route) => [route.truckId.toString(), route]));

  return trucks
    .map((truck) => {
      const route = routeMap.get(truck._id.toString());
      if (!route || !route.stops?.length) return null;
      return {
        truck,
        route,
      };
    })
    .filter(Boolean);
};

const getCompanyPairData = async (companyId) => {
  const trucks = await Truck.find({ companyId });
  if (!trucks.length) return [];

  const truckById = new Map(trucks.map((truck) => [truck._id.toString(), truck]));
  const truckIds = trucks.map((truck) => truck._id);
  const routes = await Route.find({ truckId: { $in: truckIds } });
  const routeByTruckId = new Map(routes.map((route) => [route.truckId.toString(), route]));
  const pairs = await MergeablePair.find({
    truckOneId: { $in: truckIds },
    truckTwoId: { $in: truckIds },
  });

  return pairs
    .map((pair) => {
      const truckOne = truckById.get(pair.truckOneId.toString());
      const truckTwo = truckById.get(pair.truckTwoId.toString());
      if (!truckOne || !truckTwo) return null;
      const routeOne = routeByTruckId.get(pair.truckOneId.toString());
      const routeTwo = routeByTruckId.get(pair.truckTwoId.toString());
      return {
        pairId: `${pair.truckOneId}-${pair.truckTwoId}`,
        truckOne,
        truckTwo,
        truckOneSource: routeOne?.source || "",
        truckTwoSource: routeTwo?.source || "",
        truckOneStops: routeOne?.stops || pair.truckOneStops || [],
        truckTwoStops: routeTwo?.stops || pair.truckTwoStops || [],
      };
    })
    .filter(Boolean);
};

aiRouter.post("/ai/route-suggestion", companyAuth, async (req, res) => {
  try {
    const companyId = req.company._id;
    const companyName = req.company.name || "this company";
    const routeData = await getCompanyRouteData(companyId);

    const rawPairs = [];
    const pairSource =
      routeData.length >= 2
        ? (() => {
            const pairs = [];
            for (let i = 0; i < routeData.length; i++) {
              for (let j = i + 1; j < routeData.length; j++) {
                pairs.push({
                  pairId: `${routeData[i].truck._id}-${routeData[j].truck._id}`,
                  truckOne: routeData[i].truck,
                  truckTwo: routeData[j].truck,
                  truckOneSource: routeData[i].route.source,
                  truckTwoSource: routeData[j].route.source,
                  truckOneStops: routeData[i].route.stops,
                  truckTwoStops: routeData[j].route.stops,
                });
              }
            }
            return pairs;
          })()
        : await getCompanyPairData(companyId);

    if (!pairSource.length) {
      return res.status(200).json({
        suggestions: [],
        message:
          "Need at least two routes under the same company account to generate suggestions.",
      });
    }

    pairSource.forEach((pair) => {
      const scoring = scorePair({
        truckOne: pair.truckOne,
        truckTwo: pair.truckTwo,
        truckOneSource: pair.truckOneSource,
        truckTwoSource: pair.truckTwoSource,
        truckOneStops: pair.truckOneStops,
        truckTwoStops: pair.truckTwoStops,
      });

      rawPairs.push({
        pairId: pair.pairId,
        truckOneId: pair.truckOne._id,
        truckOneLicensePlate: pair.truckOne.licensePlate,
        truckOneSource: pair.truckOneSource,
        truckOneStops: pair.truckOneStops,
        truckTwoId: pair.truckTwo._id,
        truckTwoLicensePlate: pair.truckTwo.licensePlate,
        truckTwoSource: pair.truckTwoSource,
        truckTwoStops: pair.truckTwoStops,
        ...scoring,
      });
    });

    const topCandidates = rawPairs
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!hasGeminiConfig()) {
      return res.status(200).json({
        suggestions: topCandidates.map((candidate) => ({
          ...candidate,
          aiRecommendation:
            candidate.capacityFit && candidate.isSubset
              ? "Strong merge candidate with route overlap and sufficient spare capacity."
              : "Potential merge candidate. Verify stop order and available capacity before merging.",
        })),
        message: "Gemini key missing, showing heuristic suggestions only.",
      });
    }

    const aiInput = topCandidates.map((candidate) => ({
      pairId: candidate.pairId,
      truckOneLicensePlate: candidate.truckOneLicensePlate,
      truckTwoLicensePlate: candidate.truckTwoLicensePlate,
      truckOneSource: candidate.truckOneSource,
      truckTwoSource: candidate.truckTwoSource,
      truckOneStops: candidate.truckOneStops,
      truckTwoStops: candidate.truckTwoStops,
      overlapRatio: candidate.overlapRatio,
      capacityFit: candidate.capacityFit,
      score: candidate.score,
      savingsEstimate: candidate.savingsEstimate,
      routeOneDistanceKm: candidate.routeOneDistanceKm,
      routeTwoDistanceKm: candidate.routeTwoDistanceKm,
      potentialDistanceSavingsKm: candidate.potentialDistanceSavingsKm,
    }));

    let aiResult;
    try {
      aiResult = await generateGeminiJson({
        systemPrompt:
          "You are a logistics optimization assistant. Reply strictly in JSON only (no markdown, no code fences) with this shape: {\"recommendations\":[{\"pairId\":\"string\",\"decision\":\"merge|consider|avoid\",\"reason\":\"string\"}]}. Keep each reason under 35 words.",
        userPrompt: `Company: ${companyName}. Evaluate these route merge candidates:\n${JSON.stringify(
          aiInput
        )}`,
      });
    } catch (error) {
      // Keep endpoint reliable even when the AI provider returns malformed output.
      aiResult = { recommendations: [] };
    }

    const aiRecommendations = new Map(
      (aiResult.recommendations || []).map((item) => [item.pairId, item])
    );

    const suggestions = topCandidates.map((candidate) => {
      const recommendation = aiRecommendations.get(candidate.pairId);
      return {
        ...candidate,
        decision: recommendation?.decision || "consider",
        aiRecommendation:
          recommendation?.reason ||
          "Consider merge after validating stop sequence and truck load constraints.",
      };
    });

    return res.status(200).json({ suggestions });
  } catch (error) {
    console.error("AI route suggestion error:", error);
    return res.status(502).json({
      error: "Failed to generate AI route suggestions.",
      details: "AI provider request failed. Please try again in a moment.",
    });
  }
});

aiRouter.post("/ai/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required." });
    }

    if (!hasGeminiConfig()) {
      return res.status(200).json({
        reply:
          "AI chat is not configured yet. Please add GEMINI_API_KEY in backend/.env and restart the server.",
      });
    }

    const compactHistory = Array.isArray(history)
      ? history.slice(-8).map((entry) => ({
          role: entry.role === "assistant" ? "assistant" : "user",
          text: String(entry.text || "").slice(0, 300),
        }))
      : [];

    const { cleanedText } = await generateGeminiResponse({
      systemPrompt: APP_CHAT_SYSTEM_PROMPT,
      userPrompt: `Conversation:\n${JSON.stringify(
        compactHistory
      )}\n\nUser message: ${message}`,
    });

    return res.status(200).json({
      reply:
        cleanedText ||
        "I could not generate a response right now. Please try again.",
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(502).json({
      error: "Failed to generate AI response.",
      details: "AI provider request failed. Please try again in a moment.",
    });
  }
});

module.exports = aiRouter;
