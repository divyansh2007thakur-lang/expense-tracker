const categories = ["Food", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Other"];
const categoryColors = {
  Food: 0,
  Transport: 1,
  Shopping: 2,
  Bills: 3,
  Health: 4,
  Entertainment: 5,
  Other: 6
};
const currencySymbols = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
const currencyStorageKey = "daybook-currency";
const expenseStorageKey = "daybook-expenses";
const proofDatabaseName = "daybook-payment-proofs";
const proofStoreName = "screenshots";
const maxProofSize = 5 * 1024 * 1024;
const allowedProofTypes = ["image/jpeg", "image/png", "image/webp"];

const monthFilter = document.querySelector("#month-filter");
const currencySelect = document.querySelector("#currency");
const form = document.querySelector("#expense-form");
const formMessage = document.querySelector("#form-message");
const addButton = form.querySelector("button[type=submit]");
const proofDialog = document.querySelector("#proof-dialog");
const proofPreview = document.querySelector("#proof-preview");
let proofDatabasePromise;
let proofPreviewUrl;
let dashboardLoadId = 0;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrency() {
  return currencySelect.value;
}

function formatMoney(cents) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: getCurrency(),
    maximumFractionDigits: 2
  }).format(cents / 100);
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function monthLabel(value, options = { month: "long", year: "numeric" }) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, 1));
}

function categoryColor(category) {
  return categoryColors[category] ?? categoryColors.Other;
}

function setFormMessage(message, isSuccess = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("success", isSuccess);
}

function readExpenses() {
  const stored = localStorage.getItem(expenseStorageKey);
  if (!stored) return [];
  const expenses = JSON.parse(stored);
  if (!Array.isArray(expenses) || expenses.some((expense) => (
    !expense
    || typeof expense.id !== "string"
    || typeof expense.description !== "string"
    || !Number.isSafeInteger(expense.amount_cents)
    || expense.amount_cents <= 0
    || !categories.includes(expense.category)
    || typeof expense.date !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(expense.date)
  ))) {
    throw new Error("Saved expenses could not be read. Your browser data was not changed.");
  }
  return expenses;
}

function saveExpenses(expenses) {
  localStorage.setItem(expenseStorageKey, JSON.stringify(expenses));
}

function openProofDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Screenshot storage is unavailable in this browser."));
  }
  if (!proofDatabasePromise) {
    proofDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(proofDatabaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(proofStoreName)) {
          database.createObjectStore(proofStoreName, { keyPath: "expenseId" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          proofDatabasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        proofDatabasePromise = null;
        reject(request.error ?? new Error("Could not open screenshot storage."));
      };
      request.onblocked = () => {
        proofDatabasePromise = null;
        reject(new Error("Close other Daybook tabs to enable screenshot storage."));
      };
    });
  }
  return proofDatabasePromise;
}

async function getPaymentProof(expenseId) {
  const database = await openProofDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(proofStoreName, "readonly");
    const request = transaction.objectStore(proofStoreName).get(expenseId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read payment screenshot."));
  });
}

async function savePaymentProof(expenseId, file) {
  const database = await openProofDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(proofStoreName, "readwrite");
    transaction.objectStore(proofStoreName).put({
      expenseId,
      image: file,
      fileName: file.name,
      savedAt: new Date().toISOString()
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save payment screenshot."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not save payment screenshot."));
  });
}

async function removePaymentProof(expenseId) {
  const database = await openProofDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(proofStoreName, "readwrite");
    transaction.objectStore(proofStoreName).delete(expenseId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove payment screenshot."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not remove payment screenshot."));
  });
}

async function refreshDashboard() {
  const month = monthFilter.value;
  if (!month) return;
  const loadId = ++dashboardLoadId;
  document.querySelector("#category-period").textContent = month === localDateString().slice(0, 7)
    ? "THIS MONTH"
    : monthLabel(month, { month: "short", year: "numeric" }).toUpperCase();
  document.querySelector("#transaction-month-label").textContent =
    month === localDateString().slice(0, 7) ? "this month" : monthLabel(month);
  try {
    const allExpenses = readExpenses();
    const expenses = allExpenses
      .filter((expense) => expense.date.slice(0, 7) === month)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const categoryTotals = new Map();
    expenses.forEach((expense) => {
      categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + expense.amount_cents);
    });
    const categories = [...categoryTotals]
      .map(([category, total_cents]) => ({ category, total_cents }))
      .sort((a, b) => b.total_cents - a.total_cents || a.category.localeCompare(b.category));
    const summary = {
      count: expenses.length,
      total_cents: expenses.reduce((total, expense) => total + expense.amount_cents, 0),
      categories
    };
    const proofs = await Promise.all(expenses.map(async (expense) => {
      try {
        return await getPaymentProof(expense.id);
      } catch (error) {
        return { error };
      }
    }));
    if (loadId !== dashboardLoadId) return;
    renderSummary(summary);
    renderCategories(summary.categories, summary.total_cents);
    renderExpenses(expenses, proofs);
    const proofError = proofs.find((proof) => proof?.error)?.error;
    if (proofError) setFormMessage(proofError.message);
  } catch (error) {
    setFormMessage(error instanceof SyntaxError
      ? "Saved expenses are unreadable. Your browser data was not changed."
      : error.message);
  }
}

function renderSummary(summary) {
  document.querySelector("#total-spent").textContent = formatMoney(summary.total_cents);
  document.querySelector("#transaction-count").textContent = summary.count;
  const topCategory = summary.categories[0];
  document.querySelector("#top-category").textContent = topCategory?.category ?? "—";
  document.querySelector("#top-category-caption").textContent = topCategory
    ? `${formatMoney(topCategory.total_cents)} spent`
    : "Your biggest spending area";
  document.querySelector("#list-count").textContent =
    `${summary.count} ${summary.count === 1 ? "entry" : "entries"}`;
}

function renderCategories(categoryTotals, totalCents) {
  const list = document.querySelector("#category-list");
  list.replaceChildren();
  if (categoryTotals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "category-empty";
    empty.textContent = "Your category breakdown will show up here.";
    list.append(empty);
    return;
  }

  categoryTotals.forEach(({ category, total_cents }) => {
    const row = document.createElement("div");
    row.className = "category-row";
    const icon = document.createElement("span");
    icon.className = `category-icon category-color-${categoryColor(category)}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = category.slice(0, 1);
    const name = document.createElement("span");
    name.className = "category-name";
    name.textContent = category;
    const track = document.createElement("span");
    track.className = "category-track";
    track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("span");
    bar.className = `category-bar bar-color-${categoryColor(category)}`;
    bar.style.display = "block";
    bar.style.width = `${Math.max(3, (total_cents / totalCents) * 100)}%`;
    track.append(bar);
    const amount = document.createElement("span");
    amount.className = "category-amount";
    amount.textContent = formatMoney(total_cents);
    row.append(icon, name, track, amount);
    list.append(row);
  });
}

function renderExpenses(expenses, proofs) {
  const rows = document.querySelector("#expense-rows");
  const emptyState = document.querySelector("#empty-state");
  rows.replaceChildren();
  emptyState.hidden = expenses.length > 0;

  expenses.forEach((expense, index) => {
    const row = document.createElement("tr");
    const descriptionCell = document.createElement("td");
    const description = document.createElement("span");
    description.className = "expense-description";
    description.textContent = expense.description;
    descriptionCell.append(description);

    const categoryCell = document.createElement("td");
    const category = document.createElement("span");
    category.className = `expense-category category-color-${categoryColor(expense.category)}`;
    category.textContent = expense.category;
    categoryCell.append(category);

    const dateCell = document.createElement("td");
    dateCell.className = "expense-date";
    dateCell.textContent = formatDate(expense.date);

    const amountCell = document.createElement("td");
    amountCell.className = "expense-amount";
    amountCell.textContent = formatMoney(expense.amount_cents);

    const proofCell = document.createElement("td");
    proofCell.className = "proof-cell";
    const proof = proofs[index];
    if (proof?.error) {
      const unavailable = document.createElement("span");
      unavailable.className = "proof-status proof-unavailable";
      unavailable.textContent = "Unavailable";
      proofCell.append(unavailable);
    } else {
      const proofActions = document.createElement("div");
      proofActions.className = "proof-actions";
      const fileInput = document.createElement("input");
      fileInput.className = "sr-only";
      fileInput.type = "file";
      fileInput.accept = allowedProofTypes.join(",");
      fileInput.tabIndex = -1;
      fileInput.setAttribute("aria-label", `Choose a payment screenshot for ${expense.description}`);
      const uploadButton = document.createElement("button");
      uploadButton.className = "proof-button";
      uploadButton.type = "button";
      uploadButton.textContent = proof ? "Replace" : "Add screenshot";
      uploadButton.setAttribute("aria-label", `${proof ? "Replace" : "Add"} payment screenshot for ${expense.description}`);
      uploadButton.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const [file] = fileInput.files;
        if (file) uploadPaymentProof(expense, file, proofCell);
        fileInput.value = "";
      });
      proofActions.append(uploadButton, fileInput);

      if (proof) {
        const viewButton = document.createElement("button");
        viewButton.className = "proof-button proof-view-button";
        viewButton.type = "button";
        viewButton.textContent = "View";
        viewButton.setAttribute("aria-label", `View payment screenshot for ${expense.description}`);
        viewButton.addEventListener("click", () => showPaymentProof(expense, proof));
        const removeButton = document.createElement("button");
        removeButton.className = "proof-remove-button";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove payment screenshot for ${expense.description}`);
        removeButton.addEventListener("click", () => deletePaymentProof(expense, proofCell));
        proofActions.append(viewButton, removeButton);
      }
      const proofStatus = document.createElement("span");
      proofStatus.className = "proof-status";
      proofStatus.textContent = proof ? "Saved in this browser" : "Optional";
      proofCell.append(proofActions, proofStatus);
    }

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${expense.description}`);
    deleteButton.title = "Delete expense";
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7m3.5 0-.8 13h-10L6.5 7m3 3.5v6m5-6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    deleteButton.addEventListener("click", () => deleteExpense(expense));
    actionCell.append(deleteButton);

    row.append(descriptionCell, categoryCell, dateCell, amountCell, proofCell, actionCell);
    rows.append(row);
  });
}

async function uploadPaymentProof(expense, file, proofCell) {
  if (!allowedProofTypes.includes(file.type)) {
    setFormMessage("Upload a JPG, PNG, or WebP screenshot.");
    return;
  }
  if (file.size === 0 || file.size > maxProofSize) {
    setFormMessage("Screenshot must be smaller than 5 MB.");
    return;
  }
  const uploadButton = proofCell.querySelector(".proof-button");
  if (uploadButton) uploadButton.disabled = true;
  setFormMessage("");
  try {
    await savePaymentProof(expense.id, file);
    setFormMessage("Payment screenshot saved in this browser.", true);
    await refreshDashboard();
  } catch (error) {
    setFormMessage(error.name === "QuotaExceededError"
      ? "Browser storage is full. Remove another screenshot or use a smaller image."
      : error.message);
    if (uploadButton) uploadButton.disabled = false;
  }
}

function showPaymentProof(expense, proof) {
  if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
  proofPreviewUrl = URL.createObjectURL(proof.image);
  proofPreview.src = proofPreviewUrl;
  proofPreview.alt = `Payment screenshot for ${expense.description}`;
  document.querySelector("#proof-dialog-caption").textContent =
    `${expense.description} · ${formatMoney(expense.amount_cents)} · ${formatDate(expense.date)}`;
  proofDialog.showModal();
}

document.querySelector("#proof-dialog-close").addEventListener("click", () => proofDialog.close());
proofDialog.addEventListener("close", () => {
  proofPreview.removeAttribute("src");
  if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
  proofPreviewUrl = null;
});
proofDialog.addEventListener("click", (event) => {
  if (event.target === proofDialog) proofDialog.close();
});

async function deletePaymentProof(expense, proofCell) {
  const confirmed = window.confirm(`Remove the payment screenshot for "${expense.description}"?`);
  if (!confirmed) return;
  try {
    await removePaymentProof(expense.id);
    setFormMessage("Payment screenshot removed.", true);
    await refreshDashboard();
  } catch (error) {
    setFormMessage(error.message);
    const removeButton = proofCell.querySelector(".proof-remove-button");
    if (removeButton) removeButton.disabled = false;
  }
}

async function deleteExpense(expense) {
  if (!window.confirm(`Delete "${expense.description}"?`)) return;
  try {
    const expenses = readExpenses().filter((item) => item.id !== expense.id);
    await removePaymentProof(expense.id);
    saveExpenses(expenses);
    await refreshDashboard();
  } catch (error) {
    setFormMessage(error.message);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const description = String(data.get("description") ?? "").trim();
  const amountText = String(data.get("amount") ?? "");
  const category = String(data.get("category") ?? "");
  const expenseDate = String(data.get("date") ?? "");
  if (!description || description.length > 120 || !categories.includes(category)
      || !/^\d+(?:\.\d{1,2})?$/.test(amountText)) {
    setFormMessage("Check the description, amount, and category, then try again.");
    return;
  }
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) {
    setFormMessage("Amount must be greater than zero and at most 999999999.99.");
    return;
  }
  const [year, month, day] = expenseDate.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (!expenseDate || parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1
      || parsedDate.getDate() !== day) {
    setFormMessage("Choose a valid date.");
    return;
  }
  addButton.disabled = true;
  setFormMessage("");
  try {
    const expense = {
      id: crypto.randomUUID(),
      description,
      amount_cents: Math.round(amount * 100),
      category,
      date: expenseDate
    };
    saveExpenses([...readExpenses(), expense]);
    form.reset();
    document.querySelector("#expense-date").value = localDateString();
    setFormMessage("Expense added.", true);
    const expenseMonth = expense.date.slice(0, 7);
    if (monthFilter.value !== expenseMonth) monthFilter.value = expenseMonth;
    refreshDashboard();
    document.querySelector("#description").focus();
  } catch (error) {
    setFormMessage(error.name === "QuotaExceededError"
      ? "Browser storage is full. Export or remove some data before adding more expenses."
      : error instanceof SyntaxError
        ? "Saved expenses are unreadable. Your browser data was not changed."
        : "Could not save this expense in your browser.");
  } finally {
    addButton.disabled = false;
  }
});

monthFilter.addEventListener("change", refreshDashboard);
currencySelect.addEventListener("change", () => {
  try {
    localStorage.setItem(currencyStorageKey, getCurrency());
  } catch {
    setFormMessage("Currency changed for this session, but could not be saved in browser storage.");
  }
  document.querySelector("#currency-symbol").textContent = currencySymbols[getCurrency()];
  refreshDashboard();
});

const today = new Date();
monthFilter.value = localDateString().slice(0, 7);
document.querySelector("#expense-date").value = localDateString();
document.querySelector("#today-label").textContent =
  `YOUR MONEY, IN FOCUS · ${new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(today).toUpperCase()}`;
try {
  const savedCurrency = localStorage.getItem(currencyStorageKey);
  if (savedCurrency && currencySymbols[savedCurrency]) currencySelect.value = savedCurrency;
} catch {
  setFormMessage("Browser storage is unavailable. Your expenses may not be saved.");
}
document.querySelector("#currency-symbol").textContent = currencySymbols[getCurrency()];
refreshDashboard();
