import { useEffect, useState } from "react";
import axios from "axios";
import { BASE_URL } from "../utils/constants";
import { Check, Pencil, Save, Trash2, Truck, X } from "lucide-react";

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

const normalizeLicensePlate = (value = "") =>
  value.toUpperCase().replace(/\s+/g, "");

const ViewTrucks = () => {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingTruckId, setEditingTruckId] = useState(null);
  const [deletingTruckId, setDeletingTruckId] = useState(null);
  const [draft, setDraft] = useState({
    licensePlate: "",
    totalCapacity: "",
    materialType: "General Merchandise",
  });

  const fetchTrucks = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(BASE_URL + "/scheduleDelivery/trucks", {
        withCredentials: true,
      });
      setTrucks(res.data?.trucks || []);
    } catch (err) {
      setError(err.response?.data || "Unable to fetch trucks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrucks();
  }, []);

  const startEditing = (truck) => {
    setMessage("");
    setError("");
    setEditingTruckId(truck._id);
    setDraft({
      licensePlate: truck.licensePlate || "",
      totalCapacity: truck.totalCapacity ?? "",
      materialType: truck.materialType || "General Merchandise",
    });
  };

  const cancelEditing = () => {
    setEditingTruckId(null);
    setDraft({
      licensePlate: "",
      totalCapacity: "",
      materialType: "General Merchandise",
    });
  };

  const saveTruck = async (truckId) => {
    try {
      setError("");
      setMessage("");
      const payload = {
        licensePlate: normalizeLicensePlate(draft.licensePlate),
        totalCapacity: Number(draft.totalCapacity),
        materialType: draft.materialType,
      };

      const res = await axios.patch(
        BASE_URL + `/scheduleDelivery/truck/${truckId}`,
        payload,
        { withCredentials: true },
      );

      const updatedTruck = res.data?.data;
      setTrucks((prevTrucks) =>
        prevTrucks.map((truck) =>
          truck._id === truckId ? { ...truck, ...updatedTruck } : truck,
        ),
      );
      setMessage(res.data?.message || "Truck updated successfully.");
      cancelEditing();
    } catch (err) {
      if (!err.response) {
        setError(
          "Cannot reach the server. Make sure the backend is running on port 5000.",
        );
      } else {
        const data = err.response.data;
        setError(
          typeof data === "string"
            ? data
            : data?.message || data?.error || "Unable to update truck.",
        );
      }
    }
  };

  const removeTruck = async (truck) => {
    const confirmText = window.prompt(
      `Type DELETE to remove truck ${truck.licensePlate}. All routes linked to this truck will also be deleted.`,
    );

    if (!confirmText) return;
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      setError('Deletion cancelled. Please type "DELETE" exactly to confirm.');
      return;
    }

    try {
      setError("");
      setMessage("");
      setDeletingTruckId(truck._id);

      const res = await axios.delete(
        BASE_URL + `/scheduleDelivery/truck/${truck._id}`,
        { withCredentials: true },
      );

      setTrucks((prevTrucks) =>
        prevTrucks.filter((item) => item._id !== truck._id),
      );
      if (editingTruckId === truck._id) {
        cancelEditing();
      }

      const deletedRouteCount = res.data?.data?.deletedRouteCount ?? 0;
      setMessage(
        `${truck.licensePlate} removed successfully. ${deletedRouteCount} associated route(s) deleted.`,
      );
    } catch (err) {
      setError(err.response?.data || "Unable to delete truck.");
    } finally {
      setDeletingTruckId(null);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="reveal-on-scroll mb-6 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 p-5 shadow-sm">
          <h1 className="text-3xl font-extrabold text-base-content">
            Your Trucks
          </h1>
          <p className="mt-2 text-sm text-base-content/70">
            View and edit all trucks registered under your company account.
          </p>
        </div>

        {message && (
          <div className="alert alert-success mb-4 py-2 text-sm">
            <Check className="h-5 w-5" />
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="alert alert-error mb-4 py-2 text-sm">
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-base-300/70 bg-base-200/60 p-8 text-center text-base-content/70">
            Loading trucks...
          </div>
        ) : trucks.length === 0 ? (
          <div className="rounded-2xl border border-base-300/70 bg-base-200/60 p-8 text-center text-base-content/70">
            No trucks added yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {trucks.map((truck, index) => {
              const isEditing = editingTruckId === truck._id;
              return (
                <div
                  key={truck._id}
                  className="apple-glass apple-glass-hover reveal-on-scroll reveal-up rounded-2xl border border-base-300/70 bg-base-200/60 p-5 shadow-sm backdrop-blur"
                  style={{ "--reveal-delay": `${Math.min(index * 70, 280)}ms` }}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      <p className="text-lg font-semibold text-base-content">
                        {truck.licensePlate}
                      </p>
                    </div>
                    {!isEditing ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => startEditing(truck)}
                          disabled={deletingTruckId === truck._id}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-error btn-outline"
                          onClick={() => removeTruck(truck)}
                          disabled={deletingTruckId === truck._id}
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingTruckId === truck._id
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-success"
                          onClick={() => saveTruck(truck._id)}
                        >
                          <Save className="h-4 w-4" />
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={cancelEditing}
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <label className="form-control w-full">
                        <div className="label pb-1">
                          <span className="label-text">License Plate</span>
                        </div>
                        <input
                          type="text"
                          value={draft.licensePlate}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              licensePlate: normalizeLicensePlate(
                                e.target.value,
                              ),
                            }))
                          }
                          className="input input-bordered bg-base-100/70"
                        />
                      </label>

                      <label className="form-control w-full">
                        <div className="label pb-1">
                          <span className="label-text">
                            Total Capacity (kg)
                          </span>
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={draft.totalCapacity}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              totalCapacity: e.target.value,
                            }))
                          }
                          className="input input-bordered bg-base-100/70"
                        />
                      </label>

                      <label className="form-control w-full">
                        <div className="label pb-1">
                          <span className="label-text">Material Type</span>
                        </div>
                        <select
                          value={draft.materialType}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              materialType: e.target.value,
                            }))
                          }
                          className="select select-bordered bg-base-100/70"
                        >
                          {MATERIAL_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 text-sm text-base-content/80 md:grid-cols-3">
                      <p>
                        <span className="font-semibold text-base-content">
                          Capacity:
                        </span>{" "}
                        {truck.totalCapacity} kg
                      </p>
                      <p>
                        <span className="font-semibold text-base-content">
                          Material:
                        </span>{" "}
                        {truck.materialType}
                      </p>
                      <p>
                        <span className="font-semibold text-base-content">
                          Truck ID:
                        </span>{" "}
                        {truck._id}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewTrucks;
