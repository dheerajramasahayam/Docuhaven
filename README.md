# 🏰 DocuHaven
> **"Your Files, Your Sanctuary."**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Status: Stable](https://img.shields.io/badge/Status-Stable-green.svg)
![Node: v22+](https://img.shields.io/badge/Node-v22%2B-green)
![Port: 80](https://img.shields.io/badge/Port-80-blueviolet)

**DocuHaven** is a self-hosted, open-source document management system (DMS) built for simplicity, security, and complete data ownership. It replaces complex, expensive cloud solutions with a robust, locally hosted alternative that *you* control.

Perfect for **Small Businesses**, **Family Offices**, and **Privacy-Conscious Individuals**.

---

## 🚀 Why DocuHaven?

### � 100% Self-Hosted & Secure
Your data never leaves your server. We use industry-standard **AES encryption** logic and strictly enforce Role-Based Access Control (RBAC).

### � Client Portal & Family Hierarchy
Brand new in v2.0! Give your clients or family members their own login.
*   **Secure Access**: Clients only see *their* documents.
*   **Family Grouping**: Link spouses or subsidiaries under a main account.
*   **Portal Mode**: A simplified, branded dashboard just for viewers.

### � Fully Customizable
*   **Document Types**: Define your own categories (e.g., "Tax Returns", "Blueprints", "Medical Records").
*   **Customer Fields**: Track exactly what you need (e.g., "Tax ID", "Spouse Name", "Policy Number").
*   **Dynamic UI**: The interface adapts to *your* configuration.

### ⚡ Blazing Fast Deployment
Forget Docker containers or complex configs. Our **One-Click Deploy Script** handles everything:
*   Installs Node.js & Dependencies
*   Configures Port 80
*   Sets up PM2 for auto-restart
*   Secures your connection

---

## 🛠️ Tech Stack

*   **Backend**: Node.js (v22+) + Express
*   **Database**: SQLite (`better-sqlite3`) - Zero config, incredibly fast.
*   **Frontend**: Vanilla JS + Modern CSS - No build steps, no webpack, just speed.
*   **Process Manager**: PM2 for production stability.

---

## 🏁 Quick Start

### 1️⃣ One-Click Deployment (Recommended)
Run this single command on your Ubuntu/Debian server:

```bash
./deploy.sh
```
*That's it.* This script will install everything, set up the database, and start the server on Port 80.

### 2️⃣ Manual Installation (Dev Mode)
If you prefer to run it locally for development:

```bash
# Clone
git clone https://github.com/dheerajramasahayam/Docuhaven.git
cd docuhaven

# Install
npm install

# Run
npm run dev
```
Visit `http://localhost:3000`.

---

## 📖 Features at a Glance

| Feature | Description |
| :--- | :--- |
| **Setup Wizard** | A beautiful 5-step wizard to configure your admin, backups, and settings. |
| **Audit Logs** | Track every view, download, and delete. Know exactly who did what. |
| **Versioning** | Never overwrite a file by mistake. DocuHaven keeps full version history. |
| **Backups** | Configure primary and secondary backup paths (local or mounted network drives). |
| **Search** | Instant search by customer name, document type, or filename. |

---

## 🗺️ Roadmap & Upcoming Features

We are actively building the future of self-hosted docs. Here is what's coming:

- [ ] **🪄 Magic "Request" Links**: One-time upload links for non-users.
- [ ] **⏳ Expiry Tracking**: Auto-alerts for expiring IDs or policies.
- [ ] **🕰️ Visual Timeline**: See a visual history of client interactions.
- [ ] **📧 Email Integration**: SMTP support for notifications.

---

## 🤝 Contributing

We ❤️ Open Source!
DocuHaven is built by the community, for the community.

1.  **Fork** the repo.
2.  **Clone** it to your machine.
3.  **Hack** away! (Make sure to run `npm start` to test).
4.  **PR**: Submit a Pull Request.

**Good First Issues:**
*   Adding a new theme to `variables.css`.
*   Improving the Setup Wizard validation.
*   Adding a "Dark Mode" toggle.

---

## 📄 License

Distributed under the **MIT License**.
*Free to use. Free to modify. Free to own.*

---
*Built with ❤️ for the Decentralized Web.*
