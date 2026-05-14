import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../utils/constants";
import { useLocation } from "react-router-dom";
import {
  CheckCircle2,
  MapPinned,
  PackagePlus,
  Plus,
  Route,
  X,
} from "lucide-react";
import {
  formatIndianLocation,
  getCitiesForState,
  INDIAN_STATES,
} from "../data/indianLocations";

const normalizeLicensePlate = (value = "") =>
  value.toUpperCase().replace(/\s+/g, "");
const MATERIAL_TYPE_OPTIONS = [
  "Building Materials",
  "Automotive Parts and Vehicles",
  "Fresh Produce",
  "Food and Grocery Products",
  "Pharmaceutical and Medical Supplies",
  "Industrial Machinery and Equipment",
  "Chemicals (Non-Hazardous)",
  "Textiles and Apparel",
  "Electronics and Consumer Durables",
  "General Merchandise",
  "Other",
];

const AddRoute = () => {
  const location = useLocation();
  const [trucks, setTrucks] = useState([]);
  const [selectedTruckId, setSelectedTruckId] = useState(
    location.state?.truckId || "",
  );
  const [sourceState, setSourceState] = useState("Uttar Pradesh");
  const [sourceCity, setSourceCity] = useState("");
  const [destinationState, setDestinationState] = useState("Uttar Pradesh");
  const [destinationCity, setDestinationCity] = useState("");
  const [destinationLoad, setDestinationLoad] = useState("");
  const [materialType, setMaterialType] = useState("General Merchandise");
  const [stopRows, setStopRows] = useState([
    { stopState: "Uttar Pradesh", stopCity: "", stopLoad: "" },
  ]);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const selectedTruck = useMemo(
    () => trucks.find((truck) => truck._id === selectedTruckId) || null,
    [trucks, selectedTruckId],
  );

  const fetchTrucks = async () => {
    try {
      const res = await axios.get(BASE_URL + "/scheduleDelivery/trucks", {
        withCredentials: true,
      });
      const companyTrucks = res.data?.trucks || [];
      setTrucks(companyTrucks);

      if (!selectedTruckId && companyTrucks.length > 0) {
        const preferredTruck = companyTrucks.find(
          (truck) =>
            truck.licensePlate ===
            normalizeLicensePlate(
              location.state?.licensePlate ||
                localStorage.getItem("lastAddedTruckLicensePlate") ||
                "",
            ),
        );
        setSelectedTruckId(preferredTruck?._id || companyTrucks[0]._id);
      }
    } catch (err) {
      setError(err.response?.data || "Unable to fetch your trucks.");
    }
  };

  useEffect(() => {
    fetchTrucks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTruck?.materialType) {
      setMaterialType(selectedTruck.materialType);
    }
  }, [selectedTruck]);

  const addStop = () => {
    if (stopRows.length < 10) {
      setStopRows([
        ...stopRows,
        {
          stopState: sourceState || "Uttar Pradesh",
          stopCity: "",
          stopLoad: "",
        },
      ]);
    }
  };

  const removeStop = (indexToRemove) => {
    if (stopRows.length === 1) {
      setStopRows([
        {
          stopState: sourceState || "Uttar Pradesh",
          stopCity: "",
          stopLoad: "",
        },
      ]);
      return;
    }
    setStopRows(stopRows.filter((_, index) => index !== indexToRemove));
  };

  const updateStopRow = (index, key, value) => {
    const updatedRows = [...stopRows];
    updatedRows[index] = { ...updatedRows[index], [key]: value };
    setStopRows(updatedRows);
  };

  const handleAddRoute = async () => {
    try {
      setError("");
      setSuccessMessage("");
      setInfoMessage("");

      if (!selectedTruckId) {
        setError("Please select a truck.");
        return;
      }

      if (
        !sourceState ||
        !sourceCity ||
        !destinationState ||
        !destinationCity
      ) {
        setError(
          "Please choose both state and city for source and destination.",
        );
        return;
      }
      const normalizedSource = formatIndianLocation(sourceCity, sourceState);
      const normalizedDestination = formatIndianLocation(
        destinationCity,
        destinationState,
      );

      const hasIncompleteStop = stopRows.some(
        (row) =>
          ((row.stopCity || "").trim() && row.stopLoad === "") ||
          (!(row.stopCity || "").trim() && row.stopLoad !== ""),
      );
      if (hasIncompleteStop) {
        setError(
          "Each intermediate stop must include both city and stop load.",
        );
        return;
      }
      if (destinationLoad === "") {
        setError("Destination load is required.");
        return;
      }

      const sourceLower = normalizedSource.toLowerCase();
      const destinationLower = normalizedDestination.toLowerCase();

      const intermediateStops = stopRows
        .map((row) => ({
          stopName:
            row.stopCity && row.stopState
              ? formatIndianLocation(row.stopCity, row.stopState)
              : "",
          stopLoad: row.stopLoad,
        }))
        .filter((row) => row.stopName);

      const cleanedIntermediateStops = intermediateStops.filter(
        (row) =>
          row.stopName.toLowerCase() !== sourceLower &&
          row.stopName.toLowerCase() !== destinationLower,
      );

      if (cleanedIntermediateStops.length !== intermediateStops.length) {
        setInfoMessage(
          "Intermediate stops matching source/destination were auto-removed.",
        );
      }
      const normalizedStops = [
        ...cleanedIntermediateStops.map((row) => row.stopName),
        normalizedDestination,
      ];
      const normalizedStopLoads = [
        ...cleanedIntermediateStops.map((row) => Number(row.stopLoad)),
        Number(destinationLoad),
      ];

      if (normalizedStopLoads.some((load) => Number.isNaN(load) || load < 0)) {
        setError("Stop load must be a valid non-negative number.");
        return;
      }
      if (
        selectedTruck &&
        normalizedStopLoads.some((load) => load > selectedTruck.totalCapacity)
      ) {
        setError(
          `Stop load cannot exceed selected truck capacity (${selectedTruck.totalCapacity} kg).`,
        );
        return;
      }

      const res = await axios.post(
        BASE_URL + "/scheduleDelivery/addroute",
        {
          truckId: selectedTruckId,
          source: normalizedSource,
          destination: normalizedDestination,
          materialType,
          stops: normalizedStops,
          stopLoads: normalizedStopLoads,
        },
        { withCredentials: true },
      );

      console.log("Route Added:", res.data);

      if (res.status === 200 || res.status === 201) {
        setSuccessMessage("Route added successfully!");
        setStopRows([
          {
            stopState: sourceState || "Uttar Pradesh",
            stopCity: "",
            stopLoad: "",
          },
        ]);
        setDestinationCity("");
        setDestinationLoad("");
      }
    } catch (err) {
      console.log(err);
      setError(err.response?.data || "Something went wrong");
    }
  };

  return (
    <div id="route" className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="reveal-on-scroll rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 p-5 shadow-sm lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Route Planner
                </p>
                <h1 className="mt-1 text-3xl font-extrabold text-base-content">
                  Create a Delivery Route
                </h1>
                <p className="mt-2 text-sm text-base-content/70">
                  Plan source, stops, and destination loads with smarter
                  validation.
                </p>
              </div>
              <div className="hidden rounded-xl border border-base-300/70 bg-base-100/70 p-3 backdrop-blur sm:flex">
                <Route className="h-10 w-10 text-primary" />
              </div>
            </div>
          </div>
          <div className="apple-glass apple-glass-hover reveal-on-scroll reveal-up space-y-5 rounded-2xl border border-base-300/70 bg-base-200/60 p-5 shadow-md backdrop-blur-lg lg:col-span-2">
            <label className="form-control w-full">
              <div className="label pb-1">
                <span className="label-text font-semibold text-base-content">
                  Select Truck
                </span>
              </div>
              <select
                value={selectedTruckId}
                onChange={(e) => setSelectedTruckId(e.target.value)}
                className="select select-bordered w-full bg-base-100/70"
              >
                <option value="">Select one of your trucks</option>
                {trucks.map((truck) => (
                  <option key={truck._id} value={truck._id}>
                    {normalizeLicensePlate(truck.licensePlate)} -{" "}
                    {truck.totalCapacity} kg
                  </option>
                ))}
              </select>
              {selectedTruck && (
                <p className="mt-2 text-xs text-base-content/70">
                  Selected: {normalizeLicensePlate(selectedTruck.licensePlate)}{" "}
                  ({selectedTruck.totalCapacity} kg max capacity)
                </p>
              )}
            </label>

            <label className="form-control w-full">
              <div className="label pb-1">
                <span className="label-text font-semibold text-base-content">
                  Material Type
                </span>
              </div>
              <select
                className="select select-bordered w-full bg-base-100/70"
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value)}
              >
                {MATERIAL_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div className="apple-glass apple-glass-hover reveal-on-scroll rounded-xl border border-base-300/70 bg-base-100/60 p-4">
              <p className="text-sm font-semibold text-base-content">
                Route Details
              </p>
              <p className="mt-1 text-xs text-base-content/70">
                Choose valid Indian state and city pairs for source, stops, and
                destination.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="form-control w-full">
                  <div className="label pb-1">
                    <span className="label-text font-medium text-base-content">
                      Source State
                    </span>
                  </div>
                  <select
                    value={sourceState}
                    onChange={(e) => {
                      setSourceState(e.target.value);
                      setSourceCity("");
                    }}
                    className="select select-bordered w-full bg-base-100/70"
                  >
                    {INDIAN_STATES.map((stateName) => (
                      <option key={stateName} value={stateName}>
                        {stateName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-control w-full">
                  <div className="label pb-1">
                    <span className="label-text font-medium text-base-content">
                      Source City
                    </span>
                  </div>
                  <select
                    value={sourceCity}
                    onChange={(e) => setSourceCity(e.target.value)}
                    className="select select-bordered w-full bg-base-100/70"
                  >
                    <option value="">Select source city</option>
                    {getCitiesForState(sourceState).map((cityName) => (
                      <option key={cityName} value={cityName}>
                        {cityName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-base-300/70 bg-base-200/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-base-content">
                    Intermediate Stops
                  </p>
                  <button
                    onClick={addStop}
                    disabled={stopRows.length >= 10}
                    className="btn btn-sm btn-outline gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add Stop
                  </button>
                </div>
                <div className="space-y-3">
                  {stopRows.map((row, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-base-300/70 bg-base-100/70 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-base-content/70">
                          Intermediate Stop {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStop(index)}
                          className="btn btn-ghost btn-xs gap-1 text-error"
                          title="Remove stop"
                        >
                          <X className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <select
                          value={row.stopState}
                          onChange={(e) => {
                            const newState = e.target.value;
                            setStopRows((prev) =>
                              prev.map((r, i) =>
                                i === index
                                  ? { ...r, stopState: newState, stopCity: "" }
                                  : r,
                              ),
                            );
                          }}
                          className="select select-bordered w-full bg-base-100/85"
                        >
                          {INDIAN_STATES.map((stateName) => (
                            <option key={stateName} value={stateName}>
                              {stateName}
                            </option>
                          ))}
                        </select>
                        <select
                          value={row.stopCity}
                          onChange={(e) =>
                            updateStopRow(index, "stopCity", e.target.value)
                          }
                          className="select select-bordered w-full bg-base-100/85"
                        >
                          <option value="">Select stop city</option>
                          {getCitiesForState(row.stopState).map((cityName) => (
                            <option key={cityName} value={cityName}>
                              {cityName}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          placeholder="Load at stop (kg)"
                          value={row.stopLoad}
                          onChange={(e) =>
                            updateStopRow(index, "stopLoad", e.target.value)
                          }
                          className="input input-bordered w-full bg-base-100/85"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="form-control w-full">
                  <div className="label pb-1">
                    <span className="label-text font-medium text-base-content">
                      Destination State
                    </span>
                  </div>
                  <select
                    value={destinationState}
                    onChange={(e) => {
                      setDestinationState(e.target.value);
                      setDestinationCity("");
                    }}
                    className="select select-bordered w-full bg-base-100/70"
                  >
                    {INDIAN_STATES.map((stateName) => (
                      <option key={stateName} value={stateName}>
                        {stateName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-control w-full">
                  <div className="label pb-1">
                    <span className="label-text font-medium text-base-content">
                      Destination City
                    </span>
                  </div>
                  <select
                    value={destinationCity}
                    onChange={(e) => setDestinationCity(e.target.value)}
                    className="select select-bordered w-full bg-base-100/70"
                  >
                    <option value="">Select destination city</option>
                    {getCitiesForState(destinationState).map((cityName) => (
                      <option key={cityName} value={cityName}>
                        {cityName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="form-control mt-3 w-full">
                <div className="label pb-1">
                  <span className="label-text font-medium text-base-content">
                    Destination Load (kg)
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter destination load"
                  value={destinationLoad}
                  onChange={(e) => setDestinationLoad(e.target.value)}
                  className="input input-bordered w-full bg-base-100/70"
                />
              </label>
            </div>

            <button
              className="btn btn-success w-full text-base font-semibold"
              onClick={handleAddRoute}
            >
              <PackagePlus className="h-5 w-5" />
              Save Route
            </button>

            {successMessage && (
              <div className="alert alert-success py-2 text-sm">
                <CheckCircle2 className="h-5 w-5" />
                <span>{successMessage}</span>
              </div>
            )}
            {error && (
              <div className="alert alert-error py-2 text-sm">
                <span>{error}</span>
              </div>
            )}
            {infoMessage && (
              <div className="alert alert-info py-2 text-sm">
                <span>{infoMessage}</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="apple-glass apple-glass-hover reveal-on-scroll reveal-up rounded-2xl border border-base-300/70 bg-base-200/60 p-4 shadow-sm backdrop-blur">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <MapPinned className="h-4 w-4" />
                <p className="text-sm font-semibold">Trip Clarity</p>
              </div>
              <p className="text-sm text-base-content/75">
                Keep source and destination unique for clearer ETAs and route
                sequencing.
              </p>
            </div>

            <div
              className="apple-glass apple-glass-hover reveal-on-scroll reveal-up rounded-2xl border border-base-300/70 bg-base-200/60 p-4 shadow-sm backdrop-blur"
              style={{ "--reveal-delay": "90ms" }}
            >
              <div className="mb-2 flex items-center gap-2 text-secondary">
                <PackagePlus className="h-4 w-4" />
                <p className="text-sm font-semibold">Load Safety</p>
              </div>
              <p className="text-sm text-base-content/75">
                Stop loads are validated against truck capacity to prevent
                overbooking.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddRoute;
