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

const monthFilter = document.querySelector("#month-filter");
const currencySelect = document.querySelector("#currency");
const form = document.querySelector("#expense-form");
const formMessage = document.querySelector("#form-message");
const addButton = form.querySelector("button[type=submit]");
let currentExpenses = [];

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

function refreshDashboard() {
  const month = monthFilter.value;
  if (!month) return;
  document.querySelector("#category-period").textContent = month === localDateString().slice(0, 7)
    ? "THIS MONTH"
    : monthLabel(month, { month: "short", year: "numeric" }).toUpperCase();
  document.querySelector("#transaction-month-label").textContent =
    month === localDateString().slice(0, 7) ? "this month" : monthLabel(month);
  try {
    const allExpenses = readExpenses();
    currentExpenses = allExpenses
      .filter((expense) => expense.date.slice(0, 7) === month)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const categoryTotals = new Map();
    currentExpenses.forEach((expense) => {
      categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + expense.amount_cents);
    });
    const categories = [...categoryTotals]
      .map(([category, total_cents]) => ({ category, total_cents }))
      .sort((a, b) => b.total_cents - a.total_cents || a.category.localeCompare(b.category));
    const summary = {
      count: currentExpenses.length,
      total_cents: currentExpenses.reduce((total, expense) => total + expense.amount_cents, 0),
      categories
    };
    renderSummary(summary);
    renderCategories(summary.categories, summary.total_cents);
    renderExpenses(currentExpenses);
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

function renderExpenses(expenses) {
  const rows = document.querySelector("#expense-rows");
  const emptyState = document.querySelector("#empty-state");
  rows.replaceChildren();
  emptyState.hidden = expenses.length > 0;

  expenses.forEach((expense) => {
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

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${expense.description}`);
    deleteButton.title = "Delete expense";
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7m3.5 0-.8 13h-10L6.5 7m3 3.5v6m5-6v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    deleteButton.addEventListener("click", () => deleteExpense(expense));
    actionCell.append(deleteButton);

    row.append(descriptionCell, categoryCell, dateCell, amountCell, actionCell);
    rows.append(row);
  });
}

function deleteExpense(expense) {
  if (!window.confirm(`Delete "${expense.description}"?`)) return;
  try {
    const expenses = readExpenses().filter((item) => item.id !== expense.id);
    saveExpenses(expenses);
    refreshDashboard();
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
