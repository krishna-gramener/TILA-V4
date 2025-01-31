import { html, render } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";

const pdfViewerCard = document.getElementById("undertakingPdfViewerCard");
const pdfViewer = document.getElementById("undertakingPdfViewer");

const state = {
  undertakingPdfs: {},
  loanPdfs: {},
  undertakingExcel: {},
};

const filesUploaded = {
  isUndertakingPdf: false,
  isUndertakingExcel: false,
  isCustomerLoanPdf: false,
};

// ----------------------------------------------Misc Functions----------------------------------------------

// Show/hide loading spinner
function toggleLoading(show) {
  document.getElementById("loadingSpinner").style.display = show ? "block" : "none";
}

// Show error message
function showError(message) {
  alert(`Error: ${message}`);
}

// Highlight numbers in text
function highlightNumbers(text) {
  return text.replace(/\b\d+(\.\d+)?\b/g, '<span class="number">$&</span>');
}

// ----------------------------------------------Generate Tables----------------------------------------------
function generateFinalUndertakingTable() {
  const pdfDataArray = state.undertakingPdfs; // Array of PDF data objects
  const excelDataArray = state.undertakingExcel; // Array of Excel data objects

  // Initialize counters and mismatch trackers
  let totalAccountsChecked = 0;
  let accountsWithIncorrectData = 0;
  let incorrectAccountsByField = {
    "Annual Percentage Rate (APR)": [],
    "Finance Charge": [],
    "Amount Financed": [],
    "Total of Payments": [],
    "Number of Payments": [],
    "Monthly Payment Amount": [],
    "Origination Fee": [],
  };

  // Field mapping between PDF and Excel
  const fieldMapping = {
    "Annual Percentage Rate (APR)": "APR",
    "Finance Charge": "Finance Charge",
    "Amount Financed": "Amount Financed",
    "Total of Payments": "Total of Payments",
    "Number of Payments": "Number of Payments",
    "Monthly Payment Amount": "EMI Amount", // Map Monthly Payment Amount to EMI Amount
    "Origination Fee": "Origination Fee",
  };

  // Iterate through the PDF data array
  Object.entries(pdfDataArray).forEach(([key, pdfData]) => {
    if (key === "all") return; // Skip summary objects if present
    const loanId = pdfData["Account Number"];
    const matchingExcelRow = excelDataArray.find((excelData) => excelData["Loan Id"] == loanId);
    const path = key;
    if (matchingExcelRow) {
      totalAccountsChecked++;

      // Check for mismatches in specific fields
      for (const [pdfField, excelField] of Object.entries(fieldMapping)) {
        // Parse PDF and Excel values consistently
        let pdfValue = parseFloat(pdfData[pdfField]?.replace(/[$,%]/g, "")) || 0;
        let excelValue = parseFloat(matchingExcelRow[excelField]) || 0;

        // Special handling for fields with percentage or dollar values
        if (pdfField === "Annual Percentage Rate (APR)") {
          excelValue *= 100; // Multiply by 100 for Excel data
        }

        // Ensure both values are truncated to 2 decimal places
        pdfValue = parseFloat(pdfValue.toFixed(2));
        excelValue = parseFloat(excelValue.toFixed(2));

        // Track mismatched accounts
        if (pdfValue !== excelValue) {
          accountsWithIncorrectData++;

          // Format `ExcelValue` for display
          const formattedExcelValue =
            pdfField === "Annual Percentage Rate (APR)"
              ? `${excelValue}%`
              : [
                  "Finance Charge",
                  "Amount Financed",
                  "Total of Payments",
                  "Monthly Payment Amount",
                  "Origination Fee",
                ].includes(pdfField)
              ? `$${excelValue}`
              : excelValue;

          incorrectAccountsByField[pdfField].push({
            ApplicationId: matchingExcelRow["Application Id"],
            LoanId: loanId,
            BookingDate: matchingExcelRow["Booking Date"] || "N/A",
            PdfValue: pdfData[pdfField] || "N/A",
            ExcelValue: formattedExcelValue || "N/A",
            Path: path || "", // Ensure formatted display
          });
        }
      }
    }
  });

  // Generate category-wise summary for incorrect accounts
  let categorySummaryRows = Object.entries(incorrectAccountsByField)
    .map(([field, accounts]) => {
      return `
        <tr>
          <th>Number of Incorrect Accounts for ${field}</th>
          <td>${accounts.length}</td>
        </tr>`;
    })
    .join("");

  // Generate tables for incorrect accounts by field
  let mismatchTables = Object.entries(incorrectAccountsByField)
    .map(([field, mismatchedAccounts]) => {
      if (mismatchedAccounts.length === 0) return ""; // Skip if no mismatches

      const rows = mismatchedAccounts
        .map(
          (account) => `
          <tr class="clickable-row" data-pdf-url="${account.Path}" style="cursor: pointer;">
            <td>${account.ApplicationId}</td>
            <td>${account.LoanId}</td>
            <td>${account.BookingDate}</td>
            <td>${account.PdfValue}</td>
            <td>${account.ExcelValue}</td>
            <td>
            <button class="email-btn" data-loan-id="${account.LoanId}" data-category="${field}">
              <i class="bi bi-envelope"></i>
            </button>
            </td>
          </tr>`
        )
        .join("");

      return `
        <h3>Incorrect Accounts for ${field}</h3>
        <table class="table table-striped">
          <thead>
            <tr>
              <th>Application ID</th>
              <th>Loan ID</th>
              <th>Booking Date</th>
              <th>${field} (TILA)</th>
              <th>${field} (Production)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>`;
    })
    .join("");

  // Generate the summary table
  let summaryTable = `
      <table class="table table-striped mb-4">
        <tbody>
          <tr>
            <th>Total Accounts Checked</th>
            <td>${totalAccountsChecked}</td>
          </tr>
          <tr>
            <th>Total Accounts with Incorrect Data</th>
            <td>${accountsWithIncorrectData}</td>
          </tr>
          ${categorySummaryRows}
        </tbody>
      </table>`;

  // Return both the summary table and the mismatch tables
  return {
    summaryTable: summaryTable,
    mismatchTables: mismatchTables,
  };
}

function generateFinalCmTable() {
  const pdfArray = state.undertakingPdfs;
  const excelArray = state.undertakingExcel;
  const loanArray = state.loanPdfs;

  if (!loanArray || !Object.keys(loanArray).length) {
    return `<p>No loan data available.</p>`;
  }

  let totalAccounts = 0;
  let incorrectAccounts = 0;
  const incorrectCountsByCategory = {}; // To track incorrect counts per category

  const discrepancyData = {};

  const cleanValue = (value) =>
    typeof value === "string"
      ? parseFloat(value.replace(/[$,%]/g, "")).toFixed(2) || value
      : value !== null
      ? value.toFixed(2)
      : value !== undefined
      ? value
      : "NA";

  const formatCurrency = (value) => {
    if (value === "NA" || value === null) return "NA";
    if (!isNaN(value)) return `$${parseFloat(value).toFixed(2)}`; // Truncate to 2 decimal places
    return value;
  };

  Object.entries(loanArray).forEach(([key, loanData]) => {
    totalAccounts++;
    const loanId = loanData["Loan Id"];
    const pdfData = Object.values(pdfArray).find((item) => item["Account Number"] === loanId) || {};
    const excelData = excelArray.find((item) => item["Loan Id"] == loanId) || {};
    const bookingDate = excelData["Booking Date"] || "NA";
    const paymentMonthDate = excelData["Month Date"] || "NA";
    const path = key;
    let hasIncorrectDetails = false;
    const addDiscrepancy = (category, pdfValue, loanValue, excelValue) => {
      // Skip this discrepancy if loan value is null or pdf value is 5
      if (loanValue === null || (loanValue == 25 && excelValue == 0)) {
        return;
      }

      if (!discrepancyData[category]) {
        discrepancyData[category] = [];
        incorrectCountsByCategory[category] = 0; // Initialize count for this category
      }

      // Adjust loan value for "Late Charges"
      const adjustedPdfValue = category === "Late Charges" ? 7 : pdfValue;
      discrepancyData[category].push({
        loanId,
        bookingDate,
        paymentMonthDate,
        pdf: formatCurrency(adjustedPdfValue),
        loan: formatCurrency(loanValue),
        excel: formatCurrency(excelValue),
        Path: path,
      });

      incorrectCountsByCategory[category]++; // Increment count for this category
      hasIncorrectDetails = true;
    };

    // Returned Payment Fee Comparison
    const pdfReturnedFee = cleanValue(pdfData["Returned Payment Fee"]);
    const loanReturnedFee = cleanValue(loanData["Payment Return Amount"]); // Loan data mapping
    const excelReturnedFee = cleanValue(excelData["Returned Payment Charges"]); // Excel data mapping
    if (
      loanReturnedFee !== pdfReturnedFee ||
      loanReturnedFee !== excelReturnedFee ||
      pdfReturnedFee !== excelReturnedFee
    ) {
      addDiscrepancy("Returned Payment Fee", pdfReturnedFee, loanReturnedFee, excelReturnedFee);
    }

    // Late Charges Comparison
    const pdfLateCharges = cleanValue(pdfData["Late Charges"]);
    const loanLateCharges = cleanValue(loanData["Late Fee amount"]); // Loan data mapping
    const excelLateCharges = cleanValue(excelData["Late Fee Charges"]); // Excel data mapping
    if (
      loanLateCharges !== pdfLateCharges ||
      loanLateCharges !== excelLateCharges ||
      pdfLateCharges !== excelLateCharges
    ) {
      addDiscrepancy("Late Charges", pdfLateCharges, loanLateCharges, excelLateCharges);
    }

    if (hasIncorrectDetails) {
      incorrectAccounts++;
    }
  });

  // Generate Summary Table
  const categorySummaryRows = Object.keys(incorrectCountsByCategory)
    .map(
      (category) => `
        <tr>
          <td>${category}</td>
          <td>${incorrectCountsByCategory[category]}</td>
        </tr>`
    )
    .join("");

  const summaryTable = `
    <table class="table table-striped">
    <h3>Summary</h3>
      <thead>
        <tr>
          <th>Total Accounts Checked</th>
          <td>${totalAccounts}</td>
          </tr>
          </thead>
          <tbody>
          <tr>
          <th>Accounts with Incorrect Details</th>
          <td>${incorrectAccounts}</td>
        </tr>
      </tbody>
    </table>
    <h4>Category-Wise Incorrect Accounts</h4>
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Category</th>
          <th>Incorrect Accounts</th>
        </tr>
      </thead>
      <tbody>
        ${categorySummaryRows}
      </tbody>
    </table>`;

  // Generate Category-Wise Tables
  const categoryTables = Object.keys(discrepancyData)
    .map((category) => {
      const rows = discrepancyData[category]
        .map((row) => {
          const { loanId, bookingDate, paymentMonthDate, pdf, loan, excel, Path } = row;
          return `
          <tr class="clickable-row" data-pdf-url="${Path}" style="cursor: pointer;">
              <td>${loanId}</td>
              <td>${bookingDate}</td>
              <td>${paymentMonthDate}</td>
              <td>${loan}</td>
              <td>${pdf}</td>
              <td>${excel}</td>
              <td>
              <button class="email-btn" data-loan-id="${loanId}" data-category="${category}">
              <i class="bi bi-envelope"></i>
              </td>
            </button>
            </tr>`;
        })
        .join("");

      return `
      <table class="table table-striped my-4">
      <h4>Accounts with Incorrect ${category}</h4>
          <thead>
          <tr>
              <th>Loan Id</th>
              <th>Booking Date</th>
              <th>Payment Month Date</th>
              <th>${category} (Customer Comm.)</th>
              <th>${category} (TILA)</th>
              <th>${category} (Production Data)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows || "<tr><td colspan='6'>No discrepancies found.</td></tr>"}
          </tbody>
        </table>`;
    })
    .join("");

  // Combine Tables
  return `
    <div>
      ${summaryTable}
      ${categoryTables}
    </div>`;
}

// ----------------------------------------Styling Event Listeners----------------------------------
document.getElementById("undertakingCard").addEventListener("click", () => {
  const undertakingSection = document.getElementById("undertakingSection");
  undertakingSection.classList.toggle("d-none");
  document.getElementById("customerSection").classList.add("d-none");

  const undertakingCard = document.getElementById("undertakingCard");
  if (!undertakingSection.classList.contains("d-none")) {
    undertakingCard.classList.add("bg-primary", "text-white");
  } else {
    undertakingCard.classList.remove("bg-primary", "text-white");
  }
  document.getElementById("customerManagementCard").classList.remove("bg-primary", "text-white");
});

document.getElementById("customerManagementCard").addEventListener("click", () => {
  const customerSection = document.getElementById("customerSection");
  customerSection.classList.toggle("d-none");
  document.getElementById("undertakingSection").classList.add("d-none");

  const customerCard = document.getElementById("customerManagementCard");
  if (!customerSection.classList.contains("d-none")) {
    customerCard.classList.add("bg-primary", "text-white");
  } else {
    customerCard.classList.remove("bg-primary", "text-white");
  }
  document.getElementById("undertakingCard").classList.remove("bg-primary", "text-white");
});

// ---------------------------------------Individual Reports-----------------------------------------------
document.getElementById("undertakingPdfSelect").addEventListener("change", (e) => {
  const selectedFile = e.target.value;
  const pdfContent = state.undertakingPdfs[selectedFile]?.["Complete Extracted Text"] || "";
  const loadingSpinner = document.getElementById("loadingSpinner");
  const pdfExtractCard = document.getElementById("undertakingPdfContentCard");

  const toggleVisibility = (isVisible) => {
    loadingSpinner.classList.toggle("d-none", !isVisible);
    pdfViewerCard.classList.toggle("d-none", isVisible);
    pdfExtractCard.classList.toggle("d-none", isVisible);
  };

  try {
    toggleVisibility(true);

    if (!selectedFile) return;
    if (!pdfContent) throw new Error("PDF not found");

    // Display PDF content
    pdfViewer.src = selectedFile;
    document.getElementById("undertakingPdfContent").innerHTML = highlightNumbers(pdfContent);

    toggleVisibility(false);
  } catch (error) {
    showError(`Error handling PDF: ${error.message}`);
    toggleVisibility(false);
  }
});

document.getElementById("loanPdfSelect").addEventListener("change", (e) => {
  const selectedFile = e.target.value;
  const pdfContent = state.loanPdfs[selectedFile]?.["Complete Extracted Text"] || "";

  // Reference elements for toggling visibility
  const elements = {
    loadingSpinner: document.getElementById("loadingSpinner"),
    pdfExtractCard: document.getElementById("customerPdfContentCard"),
    pdfViewerCard: document.getElementById("customerPdfViewerCard"),
    pdfViewer: document.getElementById("customerPdfViewer"),
    pdfContentContainer: document.getElementById("customerPdfContent"),
  };

  const toggleVisibility = (isLoading) => {
    elements.loadingSpinner.classList.toggle("d-none", !isLoading);
    elements.pdfViewerCard.classList.toggle("d-none", isLoading);
    elements.pdfExtractCard.classList.toggle("d-none", isLoading);
  };

  try {
    toggleVisibility(true);

    if (!selectedFile) return;
    if (!pdfContent) throw new Error("PDF not found");

    // Update viewer and content
    elements.pdfViewer.src = selectedFile;
    elements.pdfContentContainer.innerHTML = highlightNumbers(pdfContent);

    toggleVisibility(false);
  } catch (error) {
    showError(`Error handling PDF: ${error.message}`);
    toggleVisibility(false);
  }
});

document.getElementById("undertakingExcelSelect").addEventListener("change", async (e) => {
  filesUploaded.isUndertakingExcel = document.getElementById("undertakingExcelSelect").value !== "";
  const selectedFile = document.getElementById("undertakingPdfSelect").value;
  const pdfContent = state.undertakingPdfs[selectedFile]["Complete Extracted Text"] || "";

  try {
    loadingSpinner.classList.remove("d-none");

    if (!selectedFile || !pdfContent) {
      throw new Error("PDF not found");
    }
  } catch (error) {
    showError("Error handling PDF: " + error.message);
  } finally {
    loadingSpinner.classList.add("d-none");
  }
});

// ------------------------------------------Process Buttons-------------------------------------------
document.getElementById("undertakingProcess").addEventListener("click", (e) => {
  document.getElementById(
    "undertakingOutput"
  ).innerHTML = `<div class="spinner-border text-primary" role="status"></div>`;
  try {
    const { summaryTable, mismatchTables } = generateFinalUndertakingTable();
    const undertakingOutput = document.getElementById("undertakingOutput");
    undertakingOutput.innerHTML = "";
    undertakingOutput.innerHTML += "<h3>Summary of Incorrect Data</h3>" + summaryTable;
    undertakingOutput.innerHTML += mismatchTables;
  } catch (error) {
    showError("Processing failed: " + error.message);
  } finally {
    toggleLoading(false);
  }
});

document.getElementById("customerProcess").addEventListener("click", (e) => {
  document.getElementById("customerOutput").innerHTML = `<div class="spinner-border text-primary" role="status"></div>`;
  try {
    const table = generateFinalCmTable();
    const customerOutput = document.getElementById("customerOutput");
    customerOutput.innerHTML = "";
    customerOutput.innerHTML += table;
  } catch (error) {
    showError("Processing failed: " + error.message);
  } finally {
    toggleLoading(false);
  }
});

//---------------------------------------Send Email-------------------------------------------------------

function sendEmail(loanId, category) {
  const recipientEmail = "satyajeet.jaiswal@straive.com";
  const userDetailsPdf = Object.values(state.undertakingPdfs).filter((pdfData) => {
    return loanId === pdfData["Account Number"];
  });
  const userDetailsExcel = state.undertakingExcel.find((excelData) => excelData["Loan Id"] == loanId);
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0"); // Ensure 2 digits
  const month = String(today.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const year = today.getFullYear();
  const customDate = `${day}/${month}/${year}`;
  emailjs
    .send("service_snjh4dk", "template_9g2ly2q", {
      to_email: recipientEmail,
      subject: "Notification of Error Identified in TILA Reconciliation Process",
      message: `Dear ${userDetailsExcel["Borrower"]},\n
Re: Account Number: ${userDetailsExcel["Loan Id"]} \n
Our review has revealed discrepancies in the calculation of interest rates and/or fees associated with your loan. This error may have resulted in an incorrect balance or payment amount.
Details of the Error:\n
The error was identified on ${customDate}.\n
Error in ${category} \n
We are taking immediate action to correct the error and ensure that your account is accurately reflected.
Contact our customer service department if you have any questions or concerns.\n
Contact Information:
If you have any questions or concerns, please do not hesitate to contact us at:
Phone: 123-456-7890
Email: abc@example.com
Mailing Address: 123 Main Street, City, State, ZIP Code\n
We apologize for any inconvenience this error may have caused and appreciate your patience and understanding as we work to resolve this issue.
Sincerely,\n
Lorem Ipsum\n ${userDetailsPdf[0]["Creditor"]}\n123-456-7890 \n
`,
    })
    .then(
      (response) => {
        alert("Email sent successfully!");
      },
      (error) => {
        alert("Failed to send email. Please try again.");
        showError("FAILED...", error);
      }
    );
}

// --------------------------------------Event Listeners-----------------------------------------------------

document.querySelector("#undertakingOutput").addEventListener("click", (e) => {
  if (e.target.closest(".email-btn")) {
    e.stopPropagation();
    const button = e.target.closest(".email-btn");
    const loanId = button.getAttribute("data-loan-id");
    const category = button.getAttribute("data-category");
    sendEmail(loanId, category);
    return;
  }

  const clickedRow = e.target.closest(".clickable-row");

  if (!clickedRow) return;

  try {
    toggleLoading(true);
    // Get the data-pdf-url from the clicked row
    const pdfUrl = clickedRow.getAttribute("data-pdf-url");

    if (!pdfUrl) {
      showError("No PDF URL found for this row.");
      return;
    }

    // Find the TILA select element
    const tilaSelect = document.querySelector("#undertakingPdfSelect");

    if (!tilaSelect) {
      showError("TILA select element not found.");
      return;
    }

    // Set the select value to match the data-pdf-url
    const matchingOption = Array.from(tilaSelect.options).find((option) => option.value === pdfUrl);

    if (matchingOption) {
      tilaSelect.value = pdfUrl; // Set the selected value
      tilaSelect.dispatchEvent(new Event("change")); // Trigger the change event
      const undertakingPdfViewer = document.querySelector("#undertakingPdfViewerCard");
      undertakingPdfViewer.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      showError("No matching option found in TILA select.");
    }
  } catch (error) {
    showError(error.message);
  } finally {
    toggleLoading(false);
  }
});

document.querySelector("#customerOutput").addEventListener("click", (e) => {
  if (e.target.closest(".email-btn")) {
    e.stopPropagation();
    const button = e.target.closest(".email-btn");
    const loanId = button.getAttribute("data-loan-id");
    const category = button.getAttribute("data-category");
    sendEmail(loanId, category);
    return;
  }

  const clickedRow = e.target.closest(".clickable-row");

  if (!clickedRow) return;

  try {
    toggleLoading(true);
    // Get the data-pdf-url from the clicked row
    const pdfUrl = clickedRow.getAttribute("data-pdf-url");

    if (!pdfUrl) {
      showError("No Customer Communication found for this row.");
      return;
    }

    // Find the TILA select element
    const customerCommSelect = document.querySelector("#loanPdfSelect");

    if (!customerSection) {
      showError("TILA select element not found.");
      return;
    }

    // Set the select value to match the data-pdf-url
    const matchingOption = Array.from(customerCommSelect.options).find((option) => option.value === pdfUrl);

    if (matchingOption) {
      customerCommSelect.value = pdfUrl; // Set the selected value
      customerCommSelect.dispatchEvent(new Event("change")); // Trigger the change event
      const customerPdfViewer = document.querySelector("#customerPdfViewerCard");
      customerPdfViewer.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      showError("No matching option found in Customer Comm. select.");
    }
  } catch (error) {
    showError(error.message);
  } finally {
    toggleLoading(false);
  }
});

function createDummyOption(selectedElement) {
  const dummyOption = document.createElement("option");
  dummyOption.value = ""; // No value assigned
  dummyOption.textContent = "all.pdf"; // Text displayed in the dropdown
  selectedElement.appendChild(dummyOption);
}

async function loadFiles() {
  const undertakingPdfSelect = document.getElementById("undertakingPdfSelect");
  const undertakingExcelSelect = document.getElementById("undertakingExcelSelect");
  const loanPdfSelect = document.getElementById("loanPdfSelect");
  const customerTila = document.getElementById("customerPdfSelect");
  const customerExcel = document.getElementById("customerExcelSelect");

  try {
    // Show loading indicator
    toggleLoading(true);

    // Fetch the config.json file
    const response = await fetch("config.json");
    if (!response.ok) {
      throw new Error("Failed to fetch configuration.");
    }

    // Parse the JSON data
    const { pdfs: pdfConfig, excel: excelConfig, loan: loanConfig } = await response.json(); // Separate PDFs and Excel files
    state.undertakingPdfs = await fetch("assets/data/pdf.json").then((res) => res.json());
    state.undertakingExcel = await fetch("assets/data/excel.json").then((res) => res.json());
    state.loanPdfs = await fetch("assets/data/loan.json").then((res) => res.json());
    // Populate the PDF dropdown
    pdfConfig.forEach((pdf) => {
      const option = document.createElement("option");
      option.value = pdf.path; // Path will be used for loading
      option.textContent = pdf.name; // Name displayed in the dropdown
      option.style.display = "none";
      undertakingPdfSelect.appendChild(option);
      const customerPdfOption = option.cloneNode(true);
      customerTila.append(customerPdfOption);
    });

    createDummyOption(undertakingPdfSelect);
    createDummyOption(customerTila);

    // Populate the Excel dropdown
    excelConfig.forEach((excel) => {
      const option = document.createElement("option");
      option.value = excel.path; // Path will be used for loading
      option.textContent = excel.name; // Name displayed in the dropdown
      undertakingExcelSelect.appendChild(option);
      const customerExcelOption = option.cloneNode(true);
      customerExcel.append(customerExcelOption);
    });

    loanConfig.forEach((loan) => {
      const option = document.createElement("option");
      option.value = loan.path; // Path will be used for loading
      option.textContent = loan.name; // Name displayed in the dropdown
      option.style.display = "none";
      loanPdfSelect.appendChild(option);
    });
    createDummyOption(loanPdfSelect);
  } catch (error) {
    showError(error.message);
  } finally {
    // Hide loading indicator
    toggleLoading(false);
  }
}

// Initialize
await loadFiles().catch((error) => showError(error.message));
