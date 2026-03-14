import React, { useEffect, useMemo, useState } from "react";
import {
  callNextInQueue,
  createAdminUser,
  forceLogoutAdminUser,
  getOwnerStation,
  getStationQueue,
  listAdminUsers,
  listOrganizationOptions,
  listOwnerStations,
  loadSession,
  login,
  logout,
  setAdminUserBlocked,
  updateAdminUser,
  updateFuelStock
} from "../api.js";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "queue", label: "Queue & Availability" },
  { id: "inventory", label: "Inventory" },
  { id: "pricing", label: "Pricing & Promos" },
  { id: "reports", label: "Reports" },
  { id: "staff", label: "Staff" },
  { id: "settings", label: "Settings" }
];

const roleLabels = {
  staff: "Station Staff",
  station_manager: "Station Manager",
  city_manager: "City Manager",
  org_admin: "Org Owner",
  super_admin: "Super Admin"
};

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function buildEstimate(waitingCount) {
  const avgMinutesPerCar = 3;
  return waitingCount * avgMinutesPerCar;
}

export default function Dashboard() {
  const [active, setActive] = useState("overview");
  const [session, setSession] = useState(() => loadSession());
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState("");
  const [station, setStation] = useState(null);
  const [queueSnapshot, setQueueSnapshot] = useState(null);
  const [fuelForm, setFuelForm] = useState({
    gasolineLiters: "",
    dieselLiters: "",
    otherLiters: ""
  });
  const [statusMessage, setStatusMessage] = useState("");

  const isSuperAdmin = String(session?.user?.role || "") === "super_admin";
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState("");
  const [organizationOptions, setOrganizationOptions] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [limitToCurrentStation, setLimitToCurrentStation] = useState(true);

  const [createUserForm, setCreateUserForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "staff",
    organizationId: "",
    cityIds: "",
    stationIds: "",
    branchIds: "",
    assignToSelectedStation: true
  });
  const [createUserError, setCreateUserError] = useState("");
  const [createUserStatus, setCreateUserStatus] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const [editUserId, setEditUserId] = useState("");
  const [editUserForm, setEditUserForm] = useState(null);
  const [editUserError, setEditUserError] = useState("");
  const [editUserStatus, setEditUserStatus] = useState("");
  const [isSavingUser, setIsSavingUser] = useState(false);

  const parseIdList = (value) => {
    return String(value || "")
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const formatIdList = (value) => {
    if (!Array.isArray(value)) return "";
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  };

  const sectionTitle = useMemo(() => {
    const section = sections.find((item) => item.id === active);
    return section ? section.label : "Overview";
  }, [active]);

  const derivedMetrics = useMemo(() => {
    const waitingCount = Number(queueSnapshot?.waitingCount || 0);
    const estimatedWait = buildEstimate(waitingCount);
    const fuelStatus = station?.fuelStatus || queueSnapshot?.fuelStatus || "partial";
    return [
      { label: "Avg wait time", value: formatMinutes(estimatedWait) },
      { label: "Active queue", value: `${waitingCount} drivers` },
      {
        label: "Fuel status",
        value: fuelStatus === "full" ? "All tanks healthy" : fuelStatus === "empty" ? "Out of stock" : "Partial stock"
      },
      { label: "Pending payments", value: `${Number(queueSnapshot?.pendingCount || 0)}` }
    ];
  }, [queueSnapshot, station]);

  const filteredAdminUsers = useMemo(() => {
    const trimmedSearch = userSearch.trim().toLowerCase();
    let list = Array.isArray(adminUsers) ? adminUsers : [];

    if (roleFilter !== "all") {
      list = list.filter((user) => String(user.role || "") === roleFilter);
    }

    if (limitToCurrentStation && stationId) {
      list = list.filter((user) => Array.isArray(user.stationIds) && user.stationIds.includes(stationId));
    }

    if (trimmedSearch) {
      list = list.filter((user) => {
        const name = String(user.name || "").toLowerCase();
        const email = String(user.email || "").toLowerCase();
        const phone = String(user.phone || "").toLowerCase();
        return name.includes(trimmedSearch) || email.includes(trimmedSearch) || phone.includes(trimmedSearch);
      });
    }

    return list;
  }, [adminUsers, limitToCurrentStation, roleFilter, stationId, userSearch]);

  useEffect(() => {
    if (!session?.tokens?.accessToken) return;

    const loadStations = async () => {
      setIsLoading(true);
      setStatusMessage("");
      try {
        const data = await listOwnerStations();
        const list = data?.stations || [];
        setStations(list);
        if (list.length && !stationId) {
          setStationId(String(list[0].id || list[0]._id || ""));
        }
      } catch (error) {
        setStatusMessage(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadStations();
  }, [session?.tokens?.accessToken]);

  useEffect(() => {
    if (!session?.tokens?.accessToken || !stationId) return;
    let isActive = true;

    const loadStationData = async () => {
      setIsLoading(true);
      try {
        const [stationData, queueData] = await Promise.all([
          getOwnerStation(stationId),
          getStationQueue(stationId)
        ]);
        if (!isActive) return;
        const resolvedStation = stationData?.station || stationData;
        setStation(resolvedStation);
        setQueueSnapshot(queueData);
      } catch (error) {
        if (!isActive) return;
        setStatusMessage(error.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    loadStationData();
    const interval = setInterval(loadStationData, 30000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [session, stationId]);

  useEffect(() => {
    if (!station?.fuelInventory) return;
    setFuelForm({
      gasolineLiters: station.fuelInventory.gasolineLiters ?? "",
      dieselLiters: station.fuelInventory.dieselLiters ?? "",
      otherLiters: station.fuelInventory.otherLiters ?? ""
    });
  }, [station]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    setCreateUserForm((prev) => {
      if (!prev.assignToSelectedStation) return prev;

      const next = { ...prev };
      if (stationId) next.stationIds = String(stationId);
      if (!next.organizationId && station?.organizationId) {
        next.organizationId = String(station.organizationId);
      }
      return next;
    });
  }, [isSuperAdmin, stationId, station?.organizationId]);

  const loadAdminDirectory = async () => {
    if (!isSuperAdmin) return;
    setAdminUsersLoading(true);
    setAdminUsersError("");

    try {
      const [usersData, orgData] = await Promise.all([listAdminUsers(), listOrganizationOptions()]);
      setAdminUsers(usersData?.users || []);
      setOrganizationOptions(orgData?.organizations || []);
    } catch (error) {
      setAdminUsersError(error.message);
    } finally {
      setAdminUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.tokens?.accessToken || !isSuperAdmin) return;
    if (active !== "staff") return;
    loadAdminDirectory();
  }, [active, isSuperAdmin, session?.tokens?.accessToken]);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) return;

    setIsCreatingUser(true);
    setCreateUserError("");
    setCreateUserStatus("");

    try {
      const stationIds = createUserForm.assignToSelectedStation && stationId
        ? [String(stationId)]
        : parseIdList(createUserForm.stationIds);

      const payload = {
        name: String(createUserForm.name || "").trim(),
        email: String(createUserForm.email || "").trim().toLowerCase(),
        phone: String(createUserForm.phone || "").trim(),
        password: String(createUserForm.password || ""),
        role: String(createUserForm.role || "staff").trim().toLowerCase(),
        organizationId: String(createUserForm.organizationId || "").trim() || null,
        cityIds: [...new Set(parseIdList(createUserForm.cityIds))],
        stationIds: [...new Set(stationIds)],
        branchIds: [...new Set(parseIdList(createUserForm.branchIds))]
      };

      const result = await createAdminUser(payload);
      setCreateUserStatus(result?.message || "User created.");
      await loadAdminDirectory();

      setCreateUserForm((prev) => ({
        ...prev,
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "staff",
        cityIds: "",
        branchIds: ""
      }));
    } catch (error) {
      setCreateUserError(error.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const startEditUser = (user) => {
    setEditUserStatus("");
    setEditUserError("");
    setEditUserId(String(user?.id || ""));
    setEditUserForm({
      name: String(user?.name || ""),
      email: String(user?.email || ""),
      phone: String(user?.phone || ""),
      role: String(user?.role || "staff"),
      organizationId: String(user?.organizationId || ""),
      cityIds: formatIdList(user?.cityIds),
      stationIds: formatIdList(user?.stationIds),
      branchIds: formatIdList(user?.branchIds),
      isBlocked: Boolean(user?.isBlocked)
    });
  };

  const stopEditUser = () => {
    setEditUserId("");
    setEditUserForm(null);
    setEditUserStatus("");
    setEditUserError("");
  };

  const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin || !editUserId) return;

    setIsSavingUser(true);
    setEditUserStatus("");
    setEditUserError("");

    try {
      const payload = {
        name: String(editUserForm?.name || "").trim(),
        email: String(editUserForm?.email || "").trim().toLowerCase(),
        phone: String(editUserForm?.phone || "").trim(),
        role: String(editUserForm?.role || "staff").trim().toLowerCase(),
        organizationId: String(editUserForm?.organizationId || "").trim() || null,
        cityIds: [...new Set(parseIdList(editUserForm?.cityIds))],
        stationIds: [...new Set(parseIdList(editUserForm?.stationIds))],
        branchIds: [...new Set(parseIdList(editUserForm?.branchIds))]
      };

      const result = await updateAdminUser(editUserId, payload);
      setEditUserStatus(result?.message || "User updated.");
      await loadAdminDirectory();

      if (result?.user) {
        startEditUser(result.user);
      }
    } catch (error) {
      setEditUserError(error.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!isSuperAdmin || !editUserId) return;

    setIsSavingUser(true);
    setEditUserStatus("");
    setEditUserError("");

    try {
      const nextValue = !Boolean(editUserForm?.isBlocked);
      const result = await setAdminUserBlocked(editUserId, nextValue);
      setEditUserStatus(result?.message || (nextValue ? "User blocked." : "User unblocked."));
      await loadAdminDirectory();

      if (result?.user) {
        startEditUser(result.user);
      } else {
        setEditUserForm((prev) => (prev ? { ...prev, isBlocked: nextValue } : prev));
      }
    } catch (error) {
      setEditUserError(error.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleForceLogout = async () => {
    if (!isSuperAdmin || !editUserId) return;

    setIsSavingUser(true);
    setEditUserStatus("");
    setEditUserError("");

    try {
      const result = await forceLogoutAdminUser(editUserId);
      setEditUserStatus(result?.message || "User sessions revoked.");
      await loadAdminDirectory();
    } catch (error) {
      setEditUserError(error.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthError("");
    setIsLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    try {
      const nextSession = await login(email, password);
      setSession(nextSession);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setSession(null);
    setStations([]);
    setStationId("");
    setStation(null);
    setQueueSnapshot(null);
    setAdminUsers([]);
    setAdminUsersError("");
    setOrganizationOptions([]);
    setUserSearch("");
    setRoleFilter("all");
    setLimitToCurrentStation(true);
    setCreateUserForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      role: "staff",
      organizationId: "",
      cityIds: "",
      stationIds: "",
      branchIds: "",
      assignToSelectedStation: true
    });
    setCreateUserError("");
    setCreateUserStatus("");
    setIsCreatingUser(false);
    stopEditUser();
  };

  const handleFuelUpdate = async () => {
    if (!stationId) return;
    setIsLoading(true);
    setStatusMessage("");
    try {
      await updateFuelStock(stationId, {
        gasolineLiters: Number(fuelForm.gasolineLiters),
        dieselLiters: Number(fuelForm.dieselLiters),
        otherLiters: Number(fuelForm.otherLiters)
      });
      const refreshedStation = await getOwnerStation(stationId);
      setStation(refreshedStation?.station || refreshedStation);
      setStatusMessage("Fuel stock updated.");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCallNext = async () => {
    if (!stationId) return;
    setIsLoading(true);
    setStatusMessage("");
    try {
      await callNextInQueue(stationId);
      const queueData = await getStationQueue(stationId);
      setQueueSnapshot(queueData);
      setStatusMessage("Next ticket called.");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!session?.tokens?.accessToken) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>FuelFinder Owner Console</h1>
          <p>Sign in to manage your station operations.</p>
          <form onSubmit={handleLogin} className="login-form">
            <label>
              Email
              <input name="email" type="email" placeholder="owner@station.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="Your password" required />
            </label>
            {authError && <span className="error-text">{authError}</span>}
            <button className="btn alt" type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <small>Need access? Ask your admin to create an owner account.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>FuelFinder</h1>
          <p>Owner Console · single-station view</p>
        </div>
        <nav className="nav">
          {sections.map((section) => (
            <button
              key={section.id}
              className={active === section.id ? "active" : ""}
              onClick={() => setActive(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="cta">
          Signed in as <strong>{session?.user?.name || "Owner"}</strong>
          <br />
          <span>{roleLabels[session?.user?.role] || session?.user?.role}</span>
          <button className="btn" onClick={handleLogout} style={{ marginTop: "12px" }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h2>{sectionTitle}</h2>
            <p className="section-title">FuelFinder Owner Website</p>
          </div>
          <div className="station-chip">
            <strong>Station:</strong>
            <select
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
            >
              {stations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || `Station ${item.id}`}
                </option>
              ))}
            </select>
            <span className={`pill ${station?.isActive ? "" : "warn"}`}>
              {station?.isActive ? "Open" : "Inactive"}
            </span>
          </div>
        </div>

        {statusMessage && <div className="status-banner">{statusMessage}</div>}

        {active === "overview" && (
          <div className="grid">
            <div className="card full">
              <h3>Today at a glance</h3>
              <div className="metrics">
                {derivedMetrics.map((metric) => (
                  <div className="metric" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="card wide">
              <h3>Live status</h3>
              <div className="form-row">
                <label>
                  Queue status
                  <select defaultValue="open">
                    <option value="open">Open</option>
                    <option value="paused">Paused</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label>
                  Last updated
                  <input type="text" value={queueSnapshot?.fuelInventory?.updatedAt || "—"} readOnly />
                </label>
                <label>
                  Live queue length
                  <input type="number" value={queueSnapshot?.waitingCount || 0} readOnly />
                </label>
                <label>
                  Estimated wait
                  <input type="text" value={formatMinutes(buildEstimate(queueSnapshot?.waitingCount || 0))} readOnly />
                </label>
              </div>
              <button className="btn alt" disabled>
                Queue controls coming soon
              </button>
            </div>

            <div className="card narrow">
              <h3>Priority alerts</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Diesel below threshold</strong>
                    <span>18% remaining</span>
                  </div>
                  <span className="pill warn">Review</span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Queue spike</strong>
                    <span>{queueSnapshot?.waitingCount || 0} drivers waiting</span>
                  </div>
                  <span className="pill">Live</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {active === "queue" && (
          <div className="grid">
            <div className="card wide">
              <h3>Queue controls</h3>
              <div className="form-row">
                <label>
                  Current wait estimate
                  <input type="text" value={formatMinutes(buildEstimate(queueSnapshot?.waitingCount || 0))} readOnly />
                </label>
                <label>
                  Waiting drivers
                  <input type="number" value={queueSnapshot?.waitingCount || 0} readOnly />
                </label>
                <label>
                  Pending payments
                  <input type="number" value={queueSnapshot?.pendingCount || 0} readOnly />
                </label>
                <label>
                  Called now
                  <input type="text" value={queueSnapshot?.called?.reservationCode || "—"} readOnly />
                </label>
              </div>
              <button className="btn alt" onClick={handleCallNext} disabled={isLoading}>
                Call next ticket
              </button>
            </div>
            <div className="card narrow">
              <h3>Queue insights</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Avg wait</strong>
                    <span>{formatMinutes(buildEstimate(queueSnapshot?.waitingCount || 0))}</span>
                  </div>
                  <span className="pill">Live</span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Next call</strong>
                    <span>{queueSnapshot?.waiting?.[0]?.reservationCode || "None"}</span>
                  </div>
                  <span className="pill warn">Queue</span>
                </div>
              </div>
            </div>
            <div className="card full">
              <h3>Waiting tickets</h3>
              <div className="list">
                {(queueSnapshot?.waiting || []).slice(0, 6).map((ticket) => (
                  <div className="list-item" key={ticket.reservationId}>
                    <div>
                      <strong>{ticket.reservationCode || "Ticket"}</strong>
                      <span>Position {ticket.position}</span>
                    </div>
                    <button className="btn">View</button>
                  </div>
                ))}
                {!queueSnapshot?.waiting?.length && (
                  <div className="list-item">
                    <div>
                      <strong>No waiting tickets</strong>
                      <span>Queue is clear.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {active === "inventory" && (
          <div className="grid">
            <div className="card wide">
              <h3>Fuel availability</h3>
              <div className="form-row">
                <label>
                  Gasoline (liters)
                  <input
                    type="number"
                    value={fuelForm.gasolineLiters}
                    onChange={(event) =>
                      setFuelForm((prev) => ({ ...prev, gasolineLiters: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Diesel (liters)
                  <input
                    type="number"
                    value={fuelForm.dieselLiters}
                    onChange={(event) =>
                      setFuelForm((prev) => ({ ...prev, dieselLiters: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Other (liters)
                  <input
                    type="number"
                    value={fuelForm.otherLiters}
                    onChange={(event) =>
                      setFuelForm((prev) => ({ ...prev, otherLiters: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Last updated
                  <input type="text" value={station?.fuelInventory?.updatedAt || "—"} readOnly />
                </label>
              </div>
              <button className="btn alt" onClick={handleFuelUpdate} disabled={isLoading}>
                Update fuel stock
              </button>
            </div>
            <div className="card narrow">
              <h3>Inventory alerts</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Diesel tank</strong>
                    <span>{fuelForm.dieselLiters} liters remaining</span>
                  </div>
                  <span className="pill warn">Low</span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Gasoline tank</strong>
                    <span>{fuelForm.gasolineLiters} liters remaining</span>
                  </div>
                  <span className="pill">Stable</span>
                </div>
              </div>
            </div>
            <div className="card full">
              <h3>Stock thresholds</h3>
              <div className="form-row">
                <label>
                  Diesel low threshold (%)
                  <input type="number" defaultValue={20} />
                </label>
                <label>
                  Gasoline low threshold (%)
                  <input type="number" defaultValue={25} />
                </label>
                <label>
                  Other low threshold (%)
                  <input type="number" defaultValue={30} />
                </label>
              </div>
              <button className="btn" disabled>
                Save thresholds (coming soon)
              </button>
            </div>
          </div>
        )}

        {active === "pricing" && (
          <div className="grid">
            <div className="card wide">
              <h3>Price updates</h3>
              <div className="form-row">
                <label>
                  Gasoline price
                  <input type="number" step="0.01" defaultValue={3.79} />
                </label>
                <label>
                  Diesel price
                  <input type="number" step="0.01" defaultValue={3.49} />
                </label>
                <label>
                  Other price
                  <input type="number" step="0.01" defaultValue={3.29} />
                </label>
                <label>
                  Effective time
                  <input type="text" defaultValue="Immediate" />
                </label>
              </div>
              <button className="btn alt" disabled>
                Pricing integration coming soon
              </button>
            </div>
            <div className="card narrow">
              <h3>Active promos</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Happy Hour</strong>
                    <span>-$0.10 / liter · 4-6 PM</span>
                  </div>
                  <span className="pill">Draft</span>
                </div>
              </div>
            </div>
            <div className="card full">
              <h3>Create promotion</h3>
              <div className="form-row">
                <label>
                  Promo name
                  <input type="text" placeholder="Evening discount" />
                </label>
                <label>
                  Discount
                  <input type="text" placeholder="-$0.08 / liter" />
                </label>
                <label>
                  Start time
                  <input type="text" placeholder="6:00 PM" />
                </label>
                <label>
                  End time
                  <input type="text" placeholder="9:00 PM" />
                </label>
              </div>
              <label>
                Promo description
                <textarea placeholder="Displayed to drivers in the FuelFinder app." />
              </label>
              <button className="btn" disabled>
                Promo tools coming soon
              </button>
            </div>
          </div>
        )}

        {active === "reports" && (
          <div className="grid">
            <div className="card wide">
              <h3>Performance snapshot</h3>
              <div className="metrics">
                <div className="metric">
                  <span>Revenue (est.)</span>
                  <strong>$18.2k</strong>
                </div>
                <div className="metric">
                  <span>Repeat drivers</span>
                  <strong>41%</strong>
                </div>
                <div className="metric">
                  <span>Average ticket</span>
                  <strong>$28.60</strong>
                </div>
                <div className="metric">
                  <span>Promo uplift</span>
                  <strong>+12%</strong>
                </div>
              </div>
            </div>
            <div className="card narrow">
              <h3>Export</h3>
              <p className="section-title">Get CSV for partners</p>
              <button className="btn alt" disabled>
                Download daily CSV
              </button>
              <button className="btn" disabled>
                Download monthly CSV
              </button>
            </div>
            <div className="card full">
              <h3>Customer feedback</h3>
              <div className="list">
                {["Queue moved fast today!", "Staff were helpful", "Prices changed late"].map((item) => (
                  <div className="list-item" key={item}>
                    <div>
                      <strong>{item}</strong>
                      <span>Submitted today</span>
                    </div>
                    <button className="btn">Reply</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === "staff" && (
          <div className="grid">
            {isSuperAdmin ? (
              <>
                <div className="card wide">
                  <h3>Users & roles</h3>
                  <p className="section-title">Create and manage owner accounts</p>

                  <div className="form-row">
                    <label>
                      Search
                      <input
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Name, email, or phone"
                      />
                    </label>
                    <label>
                      Role
                      <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                        <option value="all">All roles</option>
                        <option value="staff">Staff</option>
                        <option value="station_manager">Station manager</option>
                        <option value="city_manager">City manager</option>
                        <option value="org_admin">Org admin</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </label>
                    <label>
                      Scope
                      <select
                        value={limitToCurrentStation ? "station" : "all"}
                        onChange={(event) => setLimitToCurrentStation(event.target.value === "station")}
                      >
                        <option value="station">This station</option>
                        <option value="all">All stations</option>
                      </select>
                    </label>
                    <button className="btn" onClick={loadAdminDirectory} disabled={adminUsersLoading}>
                      {adminUsersLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  {adminUsersError && <span className="error-text">{adminUsersError}</span>}

                  <div className="list">
                    {adminUsersLoading && <span>Loading users...</span>}
                    {!adminUsersLoading && !filteredAdminUsers.length && (
                      <span>No users found for this filter.</span>
                    )}
                    {!adminUsersLoading &&
                      filteredAdminUsers.map((user) => (
                        <div className="list-item" key={user.id}>
                          <div>
                            <strong>{user.name || user.email}</strong>
                            <span>
                              {(roleLabels[user.role] || user.role) + " - " + String(user.email || "")}
                              {user.isBlocked ? " - Blocked" : ""}
                            </span>
                          </div>
                          <button className="btn" onClick={() => startEditUser(user)}>
                            Manage
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="card narrow">
                  <h3>Create user</h3>
                  <p className="section-title">Super admin only</p>
                  <form onSubmit={handleCreateUser} className="login-form">
                    <label>
                      Name
                      <input
                        value={createUserForm.name}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Full name"
                        required
                      />
                    </label>
                    <label>
                      Email
                      <input
                        value={createUserForm.email}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, email: event.target.value }))}
                        type="email"
                        placeholder="user@station.com"
                        required
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        value={createUserForm.phone}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="+2519... (optional)"
                      />
                    </label>
                    <label>
                      Password
                      <input
                        value={createUserForm.password}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, password: event.target.value }))}
                        type="password"
                        placeholder="StrongP@ssw0rd"
                        required
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={createUserForm.role}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, role: event.target.value }))}
                      >
                        <option value="staff">Staff</option>
                        <option value="station_manager">Station manager</option>
                        <option value="city_manager">City manager</option>
                        <option value="org_admin">Org admin</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </label>
                    <label>
                      Organization ID
                      <input
                        value={createUserForm.organizationId}
                        onChange={(event) =>
                          setCreateUserForm((prev) => ({ ...prev, organizationId: event.target.value }))
                        }
                        list="org-options"
                        placeholder="Optional ObjectId"
                      />
                    </label>
                    <label>
                      Assign to selected station
                      <select
                        value={createUserForm.assignToSelectedStation ? "yes" : "no"}
                        onChange={(event) =>
                          setCreateUserForm((prev) => ({
                            ...prev,
                            assignToSelectedStation: event.target.value === "yes"
                          }))
                        }
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    <label>
                      Station IDs
                      <input
                        value={
                          createUserForm.assignToSelectedStation && stationId
                            ? String(stationId)
                            : createUserForm.stationIds
                        }
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, stationIds: event.target.value }))}
                        placeholder="Comma-separated ObjectIds"
                        disabled={createUserForm.assignToSelectedStation && Boolean(stationId)}
                      />
                    </label>
                    <label>
                      City IDs
                      <input
                        value={createUserForm.cityIds}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, cityIds: event.target.value }))}
                        placeholder="Comma-separated ObjectIds"
                      />
                    </label>
                    <label>
                      Branch IDs
                      <input
                        value={createUserForm.branchIds}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, branchIds: event.target.value }))}
                        placeholder="Comma-separated ObjectIds"
                      />
                    </label>

                    <datalist id="org-options">
                      {organizationOptions.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.label}
                        </option>
                      ))}
                    </datalist>

                    {createUserError && <span className="error-text">{createUserError}</span>}
                    {createUserStatus && <span className="status-banner">{createUserStatus}</span>}

                    <button className="btn alt" type="submit" disabled={isCreatingUser}>
                      {isCreatingUser ? "Creating..." : "Create user"}
                    </button>
                    <small>Password must include upper/lower/number/special and be 8+ chars.</small>
                  </form>
                </div>

                {editUserForm && (
                  <div className="card full">
                    <div className="topbar">
                      <div>
                        <h3>Manage user</h3>
                        <p className="section-title">{editUserForm.email || editUserId}</p>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="btn" type="button" onClick={handleForceLogout} disabled={isSavingUser}>
                          Force logout
                        </button>
                        <button className="btn alt" type="button" onClick={handleToggleBlock} disabled={isSavingUser}>
                          {editUserForm.isBlocked ? "Unblock user" : "Block user"}
                        </button>
                        <button className="btn" type="button" onClick={stopEditUser} disabled={isSavingUser}>
                          Close
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleSaveUser} className="form-row" style={{ alignItems: "end" }}>
                      <label>
                        Name
                        <input
                          value={editUserForm.name}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, name: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        Email
                        <input
                          value={editUserForm.email}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, email: event.target.value }))}
                          type="email"
                          required
                        />
                      </label>
                      <label>
                        Phone
                        <input
                          value={editUserForm.phone}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, phone: event.target.value }))}
                        />
                      </label>
                      <label>
                        Role
                        <select
                          value={editUserForm.role}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, role: event.target.value }))}
                        >
                          <option value="staff">Staff</option>
                          <option value="station_manager">Station manager</option>
                          <option value="city_manager">City manager</option>
                          <option value="org_admin">Org admin</option>
                          <option value="super_admin">Super admin</option>
                        </select>
                      </label>
                      <label>
                        Organization ID
                        <input
                          value={editUserForm.organizationId}
                          onChange={(event) =>
                            setEditUserForm((prev) => ({ ...prev, organizationId: event.target.value }))
                          }
                          list="org-options"
                          placeholder="Optional ObjectId"
                        />
                      </label>
                      <label>
                        City IDs
                        <input
                          value={editUserForm.cityIds}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, cityIds: event.target.value }))}
                          placeholder="Comma-separated ObjectIds"
                        />
                      </label>
                      <label>
                        Station IDs
                        <input
                          value={editUserForm.stationIds}
                          onChange={(event) =>
                            setEditUserForm((prev) => ({ ...prev, stationIds: event.target.value }))
                          }
                          placeholder="Comma-separated ObjectIds"
                        />
                      </label>
                      <label>
                        Branch IDs
                        <input
                          value={editUserForm.branchIds}
                          onChange={(event) =>
                            setEditUserForm((prev) => ({ ...prev, branchIds: event.target.value }))
                          }
                          placeholder="Comma-separated ObjectIds"
                        />
                      </label>
                      <button className="btn alt" type="submit" disabled={isSavingUser}>
                        {isSavingUser ? "Saving..." : "Save changes"}
                      </button>
                    </form>

                    {editUserError && <span className="error-text">{editUserError}</span>}
                    {editUserStatus && <span className="status-banner">{editUserStatus}</span>}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="card wide">
                  <h3>Staff roster</h3>
                  <p className="section-title">Team management</p>
                  <div className="list">
                    {["Eden Tesfaye", "Dagmawi K.", "Selam W."].map((name) => (
                      <div className="list-item" key={name}>
                        <div>
                          <strong>{name}</strong>
                          <span>Role: attendant</span>
                        </div>
                        <button className="btn">Manage</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card narrow">
                  <h3>Add staff</h3>
                  <label>
                    Name
                    <input type="text" placeholder="Full name" />
                  </label>
                  <label>
                    Role
                    <select defaultValue="attendant">
                      <option value="attendant">Attendant</option>
                      <option value="manager">Manager</option>
                      <option value="cashier">Cashier</option>
                    </select>
                  </label>
                  <button className="btn alt" disabled>
                    Invite staff (coming soon)
                  </button>
                </div>
                <div className="card full">
                  <h3>Shift checklist</h3>
                  <div className="list">
                    {["Confirm fuel status update", "Inspect pump availability", "Respond to driver reports"].map(
                      (task) => (
                        <div className="list-item" key={task}>
                          <div>
                            <strong>{task}</strong>
                            <span>Assigned to shift lead</span>
                          </div>
                          <button className="btn">Mark done</button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {active === "settings" && (
          <div className="grid">
            <div className="card wide">
              <h3>Station profile</h3>
              <div className="form-row">
                <label>
                  Station name
                  <input type="text" defaultValue={station?.name || ""} />
                </label>
                <label>
                  Address
                  <input type="text" defaultValue={station?.address || ""} />
                </label>
                <label>
                  Manager contact
                  <input type="text" defaultValue={station?.contact || ""} />
                </label>
                <label>
                  Support email
                  <input type="text" defaultValue={session?.user?.email || ""} />
                </label>
              </div>
              <button className="btn" disabled>
                Update profile (coming soon)
              </button>
            </div>
            <div className="card narrow">
              <h3>Notification rules</h3>
              <label>
                Alert threshold
                <select defaultValue="15">
                  <option value="10">10% tank remaining</option>
                  <option value="15">15% tank remaining</option>
                  <option value="20">20% tank remaining</option>
                </select>
              </label>
              <label>
                Queue spike alerts
                <select defaultValue="on">
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>
              <button className="btn alt" disabled>
                Save settings (coming soon)
              </button>
            </div>
            <div className="card full">
              <h3>Integrations</h3>
              <div className="list">
                {["POS system", "Pump telemetry", "Sentry alerts"].map((item) => (
                  <div className="list-item" key={item}>
                    <div>
                      <strong>{item}</strong>
                      <span>Connect to unlock automation</span>
                    </div>
                    <button className="btn" disabled>
                      Connect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
