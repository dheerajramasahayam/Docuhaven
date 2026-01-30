# 🏰 DocuHaven
> **"Your Files, Your Sanctuary."**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Status: Stable](https://img.shields.io/badge/Status-Stable-green.svg)

DocuHaven is a **self-hosted, open-source document management system (DMS)** designed for security, simplicity, and complete data ownership. Whether you're a small business, a family office, or just organizing personal records, DocuHaven gives you a safe harbor for your digital assets without relying on third-party cloud services.

---

## 🚀 Features

- **📂 Organized Filing**: Customer/User-centric folder structure.
- **🔐 Authorization**: Role-based access control (Admin, Employee, Viewer).
- **📝 Audit Trails**: Comprehensive logging of every view, download, and modification.
- **🔄 Version Control**: Automatically tracks file versions—never lose an old draft.
- **🏷️ Customizable Metadata**: Define custom fields for your specific needs.
- **☁️ Self-Hosted**: Runs on your own machine. Your data never leaves your premise.
- **📱 Modern UI**: Clean, responsive interface optimized for desktop workflows.

## 🛠️ Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (No configuration required!)
- **Frontend**: Vanilla JavaScript + Modern CSS (Fast, lightweight, no build step)
- **Security**: JWT Authentication, bcrypt, Helmet

## 🏁 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm (comes with Node.js)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/docuhaven.git
    cd docuhaven
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Start the server**
    ```bash
    # For production
    npm start

    # For development (auto-restart)
    npm run dev
    ```

4.  **Open in Browser**
    Visit `http://localhost:3000`.

### Initial Setup
On the first launch, you will be greeted by a **Setup Wizard**:
1. Create your **Admin Account**.
2. Select default **Document Types**.
3. Configure initial settings.

After setup, you can log in and start organizing!

## 📖 Usage Guide

### User Roles
- **Admin**: Full access. Can manage users, settings, and view audit logs.
- **Employee**: Can upload, edit, and manage documents/customers. Cannot manage users.
- **Viewer**: Read-only access to documents.

### Naming Convention
Files are automatically organized and renamed for consistency:
`{CustomerName}_{DocumentType}_{YYYY-MM-DD}.{ext}`

## 🤝 Contributing

We welcome contributions! Please feel free to verify functionality, report bugs, or submit Pull Requests.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ by the Open Source Community.*
