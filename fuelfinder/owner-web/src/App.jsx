import React, { useMemo, useState } from "react";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "queue", label: "Queue & Availability" },
  { id: "inventory", label: "Inventory" },
  { id: "pricing", label: "Pricing & Promos" },
  { id: "reports", label: "Reports" },
  { id: "staff", label: "Staff" },
  { id: "settings", label: "Settings" }
];

const mockMetrics = [
  { label: "Avg wait time", value: "7.5 min" },
  { label: "Active queue", value: "18 drivers" },
  { label: "Fuel in stock", value: "Premium + Diesel" },
  { label: "Today check-ins", value: "146" }
];

const mockAlerts = [
  { title: "Diesel below threshold", meta: "ETA to stock-out: 4h" },
  { title: "Queue spike", meta: "45% above typical 5pm load" },
  { title: "Promo ending", meta: "Happy Hour discount ends in 2h" }
];

export default function App() {
  const [active, setActive] = useState("overview");

  const sectionTitle = useMemo(() => {
    const section = sections.find((item) => item.id === active);
    return section ? section.label : "Overview";
  }, [active]);

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
          Ops tip: keep fuel status updates fresh to increase customer trust and
          reduce wasted trips.
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
            <span>Mintes Fuel Hub</span>
            <span className="pill">Open</span>
          </div>
        </div>

        {active === "overview" && (
          <div className="grid">
            <div className="card full">
              <h3>Today at a glance</h3>
              <div className="metrics">
                {mockMetrics.map((metric) => (
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
                  <input type="text" value="3 minutes ago" readOnly />
                </label>
                <label>
                  Live queue length
                  <input type="number" defaultValue={18} />
                </label>
                <label>
                  Avg wait (minutes)
                  <input type="number" defaultValue={7} />
                </label>
              </div>
              <button className="btn alt">Update live status</button>
            </div>

            <div className="card narrow">
              <h3>Priority alerts</h3>
              <div className="list">
                {mockAlerts.map((alert) => (
                  <div className="list-item" key={alert.title}>
                    <div>
                      <strong>{alert.title}</strong>
                      <span>{alert.meta}</span>
                    </div>
                    <span className="pill warn">Review</span>
                  </div>
                ))}
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
                  Queue mode
                  <select defaultValue="standard">
                    <option value="standard">Standard</option>
                    <option value="reservation">Reservation</option>
                    <option value="priority">Priority only</option>
                  </select>
                </label>
                <label>
                  Max tickets per hour
                  <input type="number" defaultValue={60} />
                </label>
                <label>
                  Current wait estimate
                  <input type="number" defaultValue={8} />
                </label>
                <label>
                  Walk-ins allowed
                  <select defaultValue="yes">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
              <button className="btn alt">Apply queue settings</button>
            </div>
            <div className="card narrow">
              <h3>Queue insights</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Peak hour</strong>
                    <span>5:00 PM - 6:00 PM</span>
                  </div>
                  <span className="pill">+32%</span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>No-show rate</strong>
                    <span>Last 7 days</span>
                  </div>
                  <span className="pill warn">6%</span>
                </div>
              </div>
            </div>
            <div className="card full">
              <h3>Ticket timeline</h3>
              <div className="list">
                {["Ticket #1024 queued", "Ticket #1012 called", "Ticket #1009 served"].map(
                  (item) => (
                    <div className="list-item" key={item}>
                      <div>
                        <strong>{item}</strong>
                        <span>Updated moments ago</span>
                      </div>
                      <button className="btn">View</button>
                    </div>
                  )
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
                  Premium
                  <select defaultValue="in-stock">
                    <option value="in-stock">In stock</option>
                    <option value="low">Low</option>
                    <option value="out">Out</option>
                  </select>
                </label>
                <label>
                  Diesel
                  <select defaultValue="low">
                    <option value="in-stock">In stock</option>
                    <option value="low">Low</option>
                    <option value="out">Out</option>
                  </select>
                </label>
                <label>
                  Regular
                  <select defaultValue="in-stock">
                    <option value="in-stock">In stock</option>
                    <option value="low">Low</option>
                    <option value="out">Out</option>
                  </select>
                </label>
                <label>
                  Next delivery ETA
                  <input type="text" defaultValue="Today, 6:30 PM" />
                </label>
              </div>
              <button className="btn alt">Update fuel status</button>
            </div>
            <div className="card narrow">
              <h3>Inventory alerts</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Diesel tank</strong>
                    <span>18% remaining</span>
                  </div>
                  <span className="pill warn">Low</span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Premium tank</strong>
                    <span>45% remaining</span>
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
                  Premium low threshold (%)
                  <input type="number" defaultValue={25} />
                </label>
                <label>
                  Regular low threshold (%)
                  <input type="number" defaultValue={30} />
                </label>
              </div>
              <button className="btn">Save thresholds</button>
            </div>
          </div>
        )}

        {active === "pricing" && (
          <div className="grid">
            <div className="card wide">
              <h3>Price updates</h3>
              <div className="form-row">
                <label>
                  Premium price
                  <input type="number" step="0.01" defaultValue={3.79} />
                </label>
                <label>
                  Diesel price
                  <input type="number" step="0.01" defaultValue={3.49} />
                </label>
                <label>
                  Regular price
                  <input type="number" step="0.01" defaultValue={3.29} />
                </label>
                <label>
                  Effective time
                  <input type="text" defaultValue="Immediate" />
                </label>
              </div>
              <button className="btn alt">Publish prices</button>
            </div>
            <div className="card narrow">
              <h3>Active promos</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Happy Hour</strong>
                    <span>-$0.10 / liter · 4-6 PM</span>
                  </div>
                  <span className="pill">Active</span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Queue Fast Pass</strong>
                    <span>Priority tickets · 12 PM</span>
                  </div>
                  <span className="pill warn">Ends soon</span>
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
              <button className="btn">Schedule promo</button>
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
              <button className="btn alt">Download daily CSV</button>
              <button className="btn">Download monthly CSV</button>
            </div>
            <div className="card full">
              <h3>Customer feedback</h3>
              <div className="list">
                {["Queue moved fast today!", "Staff were helpful", "Prices changed late"].map(
                  (item) => (
                    <div className="list-item" key={item}>
                      <div>
                        <strong>{item}</strong>
                        <span>Submitted today</span>
                      </div>
                      <button className="btn">Reply</button>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {active === "staff" && (
          <div className="grid">
            <div className="card wide">
              <h3>Staff roster</h3>
              <div className="list">
                {["Eden Tesfaye", "Dagmawi K.", "Selam W."]?.map((name) => (
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
              <button className="btn alt">Invite staff</button>
            </div>
            <div className="card full">
              <h3>Shift checklist</h3>
              <div className="list">
                {[
                  "Confirm fuel status update",
                  "Inspect pump availability",
                  "Respond to driver reports"
                ].map((task) => (
                  <div className="list-item" key={task}>
                    <div>
                      <strong>{task}</strong>
                      <span>Assigned to shift lead</span>
                    </div>
                    <button className="btn">Mark done</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === "settings" && (
          <div className="grid">
            <div className="card wide">
              <h3>Station profile</h3>
              <div className="form-row">
                <label>
                  Station name
                  <input type="text" defaultValue="Mintes Fuel Hub" />
                </label>
                <label>
                  City
                  <input type="text" defaultValue="Addis Ababa" />
                </label>
                <label>
                  Manager contact
                  <input type="text" defaultValue="+251 900 000 000" />
                </label>
                <label>
                  Support email
                  <input type="text" defaultValue="owner@fuelfinder.com" />
                </label>
              </div>
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
              <button className="btn alt">Save settings</button>
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
                    <button className="btn">Connect</button>
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
