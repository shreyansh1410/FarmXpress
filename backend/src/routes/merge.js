const express = require("express");
const mergeRouter = express.Router();
const Route = require("../models/route");
const Truck = require("../models/truck");
const { companyAuth } = require("../middlewares/auth");
const MergeablePair = require("../models/mergeablePair");
const MergedSchedule = require("../models/mergedSchedule");
const UnmergedTruck = require("../models/unmergedTruck");

mergeRouter.get("/mergeableSchedule", companyAuth, async (req, res) => {
  try {
    const companyId = req.company._id;
    const allTrucks = await Truck.find({ companyId });
    const truckIds = allTrucks.map((truck) => truck._id);
    const allRoutes = await Route.find({ truckId: { $in: truckIds } });

    if (allTrucks.length < 2) {
      return res.json({
        message:
          "Need at least two trucks in the same company account to find mergeable routes.",
      });
    }
    if (allRoutes.length < 2) {
      return res.json({
        message:
          "Need at least two routes in the same company account to find mergeable routes.",
      });
    }

    const truckRoutesMap = new Map();
    allRoutes.forEach((route) => {
      truckRoutesMap.set(route.truckId.toString(), route.stops);
    });
    const truckById = new Map(
      allTrucks.map((truck) => [truck._id.toString(), truck]),
    );

    const enrichExistingPair = (pair) => {
      const truckOne = truckById.get(pair.truckOneId.toString());
      const truckTwo = truckById.get(pair.truckTwoId.toString());
      if (!truckOne || !truckTwo) return null;

      const truckOneStops =
        pair.truckOneStops || truckRoutesMap.get(truckOne._id.toString()) || [];
      const truckTwoStops =
        pair.truckTwoStops || truckRoutesMap.get(truckTwo._id.toString()) || [];

      const biggerTruck =
        truckOne.totalCapacity >= truckTwo.totalCapacity ? truckOne : truckTwo;
      const smallerTruck =
        biggerTruck._id.toString() === truckOne._id.toString()
          ? truckTwo
          : truckOne;
      const biggerStops =
        biggerTruck._id.toString() === truckOne._id.toString()
          ? truckOneStops
          : truckTwoStops;
      const smallerStops =
        biggerTruck._id.toString() === truckOne._id.toString()
          ? truckTwoStops
          : truckOneStops;
      const commonStops = smallerStops.filter((stop) =>
        biggerStops.includes(stop),
      );

      const loadChecks = commonStops.map((stop) => {
        const indexBig = biggerStops.indexOf(stop);
        const indexSmall = smallerStops.indexOf(stop);
        const availableCapacity = biggerTruck.remainingLoad?.[indexBig] ?? 0;
        const requiredLoad = smallerTruck.currentLoad?.[indexSmall] ?? 0;
        return {
          stop,
          availableCapacity,
          requiredLoad,
          canCarry: availableCapacity >= requiredLoad,
        };
      });

      return {
        truckOneId: truckOne._id.toString(),
        truckOneLicensePlate: truckOne.licensePlate,
        truckOneStops,
        truckOneCurrentLoad: truckOne.currentLoad || [],
        truckOneRemainingLoad: truckOne.remainingLoad || [],
        truckOneTotalCapacity: truckOne.totalCapacity,
        truckTwoId: truckTwo._id.toString(),
        truckTwoLicensePlate: truckTwo.licensePlate,
        truckTwoStops,
        truckTwoCurrentLoad: truckTwo.currentLoad || [],
        truckTwoRemainingLoad: truckTwo.remainingLoad || [],
        truckTwoTotalCapacity: truckTwo.totalCapacity,
        commonStops,
        loadChecks,
        suggestion: `Merge ${smallerTruck.licensePlate} into ${biggerTruck.licensePlate}. Capacity checks pass on ${commonStops.length} overlapping stops.`,
      };
    };

    let usedTrucks = new Set();
    let mergeablePairs = [];
    let mergedTruckIds = new Set();

    for (let i = 0; i < allTrucks.length; i++) {
      if (usedTrucks.has(allTrucks[i]._id.toString())) continue;

      for (let j = 0; j < allTrucks.length; j++) {
        if (i === j || usedTrucks.has(allTrucks[j]._id.toString())) continue;

        const truckA = allTrucks[i];
        const truckB = allTrucks[j];

        const stopsA = truckRoutesMap.get(truckA._id.toString()) || [];
        const stopsB = truckRoutesMap.get(truckB._id.toString()) || [];

        // Determine merge direction based on which route is a subset of the other
        // (receiver = truck whose route is the superset, donor = truck whose route is the subset)
        let receiverTruck, donorTruck, receiverStops, donorStops;
        const aIsSubsetOfB = stopsA.every((stop) => stopsB.includes(stop));
        const bIsSubsetOfA = stopsB.every((stop) => stopsA.includes(stop));

        if (aIsSubsetOfB) {
          // A's stops fit inside B's route → merge A into B
          receiverTruck = truckB;
          donorTruck = truckA;
          receiverStops = stopsB;
          donorStops = stopsA;
        } else if (bIsSubsetOfA) {
          // B's stops fit inside A's route → merge B into A
          receiverTruck = truckA;
          donorTruck = truckB;
          receiverStops = stopsA;
          donorStops = stopsB;
        } else {
          continue; // No subset relationship — routes cannot be merged
        }

        let canMerge = true;
        for (let stop of donorStops) {
          const indexReceiver = receiverStops.indexOf(stop);
          const indexDonor = donorStops.indexOf(stop);

          if (indexReceiver === -1 || indexDonor === -1) continue;

          if (
            receiverTruck.remainingLoad[indexReceiver] <
            donorTruck.currentLoad[indexDonor]
          ) {
            canMerge = false;
            break;
          }
        }

        if (canMerge) {
          const commonStops = donorStops.filter((stop) =>
            receiverStops.includes(stop),
          );
          const loadChecks = commonStops.map((stop) => {
            const indexReceiver = receiverStops.indexOf(stop);
            const indexDonor = donorStops.indexOf(stop);
            const availableCapacity =
              receiverTruck.remainingLoad[indexReceiver] ?? 0;
            const requiredLoad = donorTruck.currentLoad[indexDonor] ?? 0;
            return {
              stop,
              availableCapacity,
              requiredLoad,
              canCarry: availableCapacity >= requiredLoad,
            };
          });

          mergeablePairs.push({
            truckOneId: receiverTruck._id.toString(),
            truckOneLicensePlate: receiverTruck.licensePlate,
            truckOneStops: receiverStops,
            truckOneCurrentLoad: receiverTruck.currentLoad || [],
            truckOneRemainingLoad: receiverTruck.remainingLoad || [],
            truckOneTotalCapacity: receiverTruck.totalCapacity,
            truckTwoId: donorTruck._id.toString(),
            truckTwoLicensePlate: donorTruck.licensePlate,
            truckTwoStops: donorStops,
            truckTwoCurrentLoad: donorTruck.currentLoad || [],
            truckTwoRemainingLoad: donorTruck.remainingLoad || [],
            truckTwoTotalCapacity: donorTruck.totalCapacity,
            commonStops,
            loadChecks,
            suggestion: `Merge ${donorTruck.licensePlate} into ${receiverTruck.licensePlate}. Capacity checks pass on ${commonStops.length} overlapping stops.`,
          });

          usedTrucks.add(receiverTruck._id.toString());
          usedTrucks.add(donorTruck._id.toString());
          mergedTruckIds.add(receiverTruck._id.toString());
          mergedTruckIds.add(donorTruck._id.toString());
          break;
        }
      }
    }

    // Fetch existing pairs from the database
    const existingPairs = await MergeablePair.find({
      truckOneId: { $in: truckIds },
      truckTwoId: { $in: truckIds },
    });

    if (mergeablePairs.length === 0 && existingPairs.length > 0) {
      const enrichedPairs = existingPairs
        .map((pair) => enrichExistingPair(pair))
        .filter(Boolean);
      if (enrichedPairs.length > 0) {
        return res.json({ mergeablePairs: enrichedPairs });
      }
    }

    if (mergeablePairs.length === 0) {
      return res.json({ message: "No mergeable truck pairs found" });
    }

    // Convert existing data to a Set for quick lookup
    const existingSet = new Set(
      existingPairs.map((pair) => `${pair.truckOneId}-${pair.truckTwoId}`),
    );

    // Filter out only the new pairs that are not in the database
    const newPairs = mergeablePairs.filter(
      (pair) => !existingSet.has(`${pair.truckOneId}-${pair.truckTwoId}`),
    );

    if (newPairs.length > 0) {
      await MergeablePair.insertMany(newPairs);
    }

    // Fetch all merged pairs from the database
    const allMergedPairs = await MergeablePair.find({
      truckOneId: { $in: truckIds },
      truckTwoId: { $in: truckIds },
    });
    allMergedPairs.forEach((pair) => {
      mergedTruckIds.add(pair.truckOneId.toString());
      mergedTruckIds.add(pair.truckTwoId.toString());
    });

    // Filter only the unmerged trucks
    const unmergedTrucks = allTrucks.filter(
      (truck) => !mergedTruckIds.has(truck._id.toString()),
    );

    if (unmergedTrucks.length > 0) {
      const unmergedTrucksData = unmergedTrucks.map((truck) => ({
        truckId: truck._id,
        licensePlate: truck.licensePlate,
        totalCapacity: truck.totalCapacity,
        currentLoad: truck.currentLoad,
        stops: truckRoutesMap.get(truck._id.toString()) || [],
      }));

      await UnmergedTruck.deleteMany({}); // Clear previous records
      await UnmergedTruck.insertMany(unmergedTrucksData);
    }

    res.json({ mergeablePairs });
  } catch (error) {
    console.error("Error fetching mergeable trucks:", error);
    res.status(500).send(error.message);
  }
});

mergeRouter.get("/mergedSchedule", companyAuth, async (req, res) => {
  try {
    const companyId = req.company._id;
    const companyTrucks = await Truck.find({ companyId });
    const companyTruckIds = companyTrucks.map((truck) => truck._id);

    // Fetch all mergeable pairs from the database
    const mergeablePairs = await MergeablePair.find({
      truckOneId: { $in: companyTruckIds },
      truckTwoId: { $in: companyTruckIds },
    })
      .populate("truckOneId")
      .populate("truckTwoId");

    if (mergeablePairs.length === 0) {
      return res.json({ message: "No mergeable schedules found" });
    }

    let mergedSchedules = [];

    for (let pair of mergeablePairs) {
      // Fetch truck details
      const truckOne = await Truck.findById(pair.truckOneId);
      const truckTwo = await Truck.findById(pair.truckTwoId);

      if (!truckOne || !truckTwo) {
        continue;
      }

      let finalTruck;
      let finalCurrentLoad = [];
      let finalRemainingLoad = [];
      let allStops = [
        ...new Set([...pair.truckOneStops, ...pair.truckTwoStops]),
      ];

      // Sorting stops based on occurrence in truckOne's schedule
      allStops.sort(
        (a, b) => pair.truckOneStops.indexOf(a) - pair.truckOneStops.indexOf(b),
      );

      // Choose the truck with the higher capacity
      finalTruck =
        truckOne.totalCapacity >= truckTwo.totalCapacity ? truckOne : truckTwo;
      let totalCapacity = finalTruck.totalCapacity; // Store the total capacity of the chosen truck

      // Calculate the final current load and remaining load at each stop
      for (let stop of allStops) {
        let indexOne = pair.truckOneStops.indexOf(stop);
        let indexTwo = pair.truckTwoStops.indexOf(stop);

        let loadOne = indexOne !== -1 ? truckOne.currentLoad[indexOne] || 0 : 0;
        let loadTwo = indexTwo !== -1 ? truckTwo.currentLoad[indexTwo] || 0 : 0;

        let totalCurrentLoadAtStop = loadOne + loadTwo;
        let remainingLoadAtStop = Math.max(
          totalCapacity - totalCurrentLoadAtStop,
          0,
        );

        finalCurrentLoad.push(totalCurrentLoadAtStop);
        finalRemainingLoad.push(remainingLoadAtStop);
      }

      // Final source and destination
      let finalSource = allStops[0];
      let finalDestination = allStops[allStops.length - 1];

      mergedSchedules.push({
        transportationTruckId: finalTruck._id.toString(),
        transportationTruckLicensePlate: finalTruck.licensePlate,
        finalSource,
        finalDestination,
        stops: allStops,
        finalCurrentLoad,
        finalRemainingLoad,
      });
    }

    if (mergedSchedules.length === 0) {
      return res.json({ message: "No valid merged schedules found" });
    }

    // Store merged schedules in the database ensuring uniqueness
    for (let schedule of mergedSchedules) {
      const existingSchedule = await MergedSchedule.findOne({
        transportationTruckId: schedule.transportationTruckId,
        stops: schedule.stops,
        finalCurrentLoad: schedule.finalCurrentLoad,
        finalRemainingLoad: schedule.finalRemainingLoad,
      });

      if (!existingSchedule) {
        await MergedSchedule.create(schedule);
      }
    }

    res.json({ mergedSchedules });
  } catch (error) {
    console.error("Error generating merged schedule:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = mergeRouter;
