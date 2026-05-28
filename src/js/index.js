$(document).ready(function () {
	const todayNP = NepaliFunctions.BS.GetCurrentDate();

	const npMonth = todayNP.month - 1 == 0 ? 12 : todayNP.month;
	const npYear = todayNP.month - 1 == 0 ? todayNP.year - 1 : todayNP.year;

	const hmisBaseUrl = "https://hmis.gov.np/hmis";
	$("#hmisBaseUrl").html(hmisBaseUrl);

	let baseUrl = window.location.origin;
	const pathSegment = window.location.pathname.split("/")[1];
	if (
		pathSegment !== null &&
		pathSegment !== "undefined" &&
		pathSegment !== "api"
	) {
		baseUrl += "/" + pathSegment;
	}

	console.log(`Base URL: ${baseUrl}`);

	let programIndicators = [];

	let selectedDataset = $("#datasetList").val();
	let selectedDatasetTitle = $("#datasetList option:selected").text();

	let selectedPeriod = $("#period").val();
	let selectedPeriodName = $("#period option:selected").text();

	let selectedOrgUnit = $("#orgUnitList").val();
	let selectedOrgUnitCode = $("#orgUnitList option:selected").attr("data-code");

	let hmisOuId = null;

	let finalJSON = {};

	selection.setListenerFunction(function (e) {
		selectedOrgUnit = e[0];
		var selectedOrgUnitName =
			document.getElementsByClassName("selected")[0].innerHTML;
		console.log(selectedOrgUnitName);
		const temp = getSelectedOrgUnitInfo(e[0]);
	});

	// Organization Unit search
	$("#searchField").autocomplete({
		source:
			"../../../../dhis-web-commons/ouwt/getOrganisationUnitsByName.action",
		select: function (event, ui) {
			$("#searchField").val(ui.item.value);
			selection.findByName();
		},
	});

	// ------------------ INIT ------------------
	async function init() {
		$("#mainContent").hide();
		$("#msgContent").show();

		$("#submissionStatus").hide();
		$("#submitBtnContainer").hide();

		loadPeriod(npYear);

		if (sessionStorage.getItem("tempCreds")) {
			$("#loginPanel").hide();
			$("#showLoginBtn").show();
			$("#loadData").show();

			await Promise.all([
				loadUserOrgUnitList(),
				getSelectedOrgUnitInfo(),
				getAvailableDatasets(),
				getLocalProgramIndicators(),
			]);
		} else {
			$("#loginPanel").show();
			$("#showLoginBtn").hide();
			$("#loadData").hide();
		}
	}

	// ------------------ HELPERS ------------------
	function getAuthHeader() {
		return {
			Authorization: "Basic " + sessionStorage.getItem("tempCreds"),
		};
	}

	async function apiGet(url, options = {}) {
		return $.ajax({
			url,
			method: "GET",
			contentType: options.contentType || "application/json",
			headers: options.headers || {},
		});
	}

	async function apiPost(url, data, options = {}) {
		return $.ajax({
			url,
			method: "POST",
			contentType: "application/json",
			headers: options.headers || {},
			data: JSON.stringify(data),
		});
	}

	function showError() {
		$("#loginError").show();
	}

	function loadPeriod(year) {
		if (year <= npYear) {
			const months = [
				"Baisakh",
				"Jestha",
				"Asar",
				"Shrawan",
				"Bhadra",
				"Ashwin",
				"Kartik",
				"Mangsir",
				"Paush",
				"Magh",
				"Falgun",
				"Chaitra",
			];

			$("#period").empty();
			let start = year == npYear ? npMonth - 1 : 12;
			for (let m = start; m >= 1; m--) {
				const value = year + ("0" + m).slice(-2);
				$("#period").append(
					$("<option></option>")
						.text(`${months[m - 1]} ${year}`)
						.val(`${value}`),
				);
			}
		}

		// Set global period variables
		selectedPeriod = $("#period").val();
		selectedPeriodName = $("#period option:selected").text();
	}

	async function getAvailableDatasets() {
		try {
			console.log("Getting available datasets from HMIS");

			const hmisUrl = `${hmisBaseUrl}/api/dataSets?fields=name,id&paging=false`;
			const res = await apiGet(hmisUrl, { headers: getAuthHeader() });

			$("#datasetList").empty();

			res.dataSets.forEach((ds) => {
				if (ds.name.substring(0, 2) !== "00") {
					$("#datasetList").append(
						$("<option></option>").text(ds.name).val(ds.id),
					);
				}
			});

			// Set global variables for immediate action
			selectedDataset = $("#datasetList").val();
			selectedDatasetTitle = $("#datasetList option:selected").text();
		} catch (e) {
			showError("Error getting data sets.");
		}
	}

	async function getSelectedOrgUnitInfo(ouId) {
		try {
			const res = await apiGet(
				`${baseUrl}/api/organisationUnits/${ouId}?fields=id,name,code`,
			);

			if (!res.code) {
				console.log("OrgUnit code is missing...");
			} else {
				await getRemoteOrgUnitIdByCode(res.code);
			}
		} catch (e) {
			showError();
		}
	}

	async function loadUserOrgUnitList() {
		$("#orgUnitList").empty();

		try {
			const res = await apiGet(
				`${baseUrl}/api/me.json?fields=organisationUnits[id,name,code]`,
			);

			if (!res) {
				console.log("Could not get user OrgUnit info...");
			} else {
				res.organisationUnits.forEach((ou) => {
					$("#orgUnitList").append(
						$("<option></option>")
							.text(ou.name)
							.val(ou.id)
							.attr("data-code", ou.code),
					);
				});

				selectedOrgUnit = $("#orgUnitList").val();
			}
		} catch (e) {
			showError();
		}
	}

	async function getRemoteOrgUnitIdByCode(code) {
		if (!code) return null;
		//console.log(code);
		try {
			const res = await apiGet(
				`${hmisBaseUrl}/api/organisationUnits?filter=code:eq:${code}&fields=id,name,code`,
				{ headers: getAuthHeader() },
			);

			if (res.organisationUnits && res.organisationUnits.length > 0) {
				const remoteId = res.organisationUnits[0].id;

				// Set global variable
				hmisOuId = remoteId;
			}
		} catch (e) {
			console.error("Error fetching remote OU", e);
			return null;
		}
	}

	async function getLocalProgramIndicators() {
		try {
			const res = await apiGet(
				`${baseUrl}/api/programIndicators?fields=id,name,attributeValues[value,attribute[name]],aggregateExportCategoryOptionCombo&paging=false`,
			);

			programIndicators = res.programIndicators;
		} catch (e) {
			showError("Error getting program indicators.");
		}
	}

	async function loadSelectedDatasetForm() {
		try {
			$("#mainContent").show();
			$("#msgContent").hide();

			$("#datasetTitle").text(
				`Dataset: ${selectedDatasetTitle} ( ${selectedPeriodName} )`,
			);

			console.log("Getting selected data set form...");

			const res = await apiGet(
				`${hmisBaseUrl}/api/dataSets/${selectedDataset}?fields=name,id,dataEntryForm[htmlCode]`,
				{ contentType: "text/html", headers: getAuthHeader() },
			);

			// Render the form html and make the input fields readonly
			$("#mainFormContainer").html(res.dataEntryForm.htmlCode);
			$("#mainFormContainer")
				.find("input, select, textarea")
				.prop("readonly", true)
				.prop("disabled", true);

			// Get HMIS orgUnit ID for completeness check and data submission
			await getRemoteOrgUnitIdByCode(
				$("#orgUnitList option:selected").data("code"),
			);

			// Fill the local data in the form for validation
			await fillLocalData();

			$("#submissionStatus").show();
			$("#submitBtnContainer").show();

			// Check if the data already submitted and warn user
			await checkDatasetCompleteness();
			$("#loadData").text("Load Data");
			$("#loadData").prop("disabled", false);
		} catch (e) {
			showError("Error loading dataset.");
		}
	}

	async function fillLocalData() {
		const inputs = $("#mainFormContainer").find(
			"input[id], select[id], textarea[id]",
		);
		const piIdsToQuery = [];

		console.log("Filtering program indicators to fetch data...");

		inputs.each(function () {
			const idParts = $(this).attr("id").split("-");
			if (idParts.length !== 3) return;

			const deId = idParts[0];

			// Make an array of programIndicators for data query
			programIndicators.forEach((pi) => {
				if (piIdsToQuery.includes(pi.id)) return; // already added, skip

				const valueToCheck = `${deId}-${idParts[1]}`;

				// Priority 1: check aggregateExportCategoryOptionCombo
				if (pi.aggregateExportCategoryOptionCombo === valueToCheck) {
					piIdsToQuery.push(pi.id);
					return;
				}

				// Priority 2: fallback to custom attribute check
				const match = (pi.attributeValues || []).find(
					(av) => av.attribute.id === "b8KbU93phhz" && av.value === deId,
				);
				if (match && pi.aggregateExportCategoryOptionCombo === idParts[1]) {
					piIdsToQuery.push(pi.id);
				}
			});
		});

		if (piIdsToQuery.length === 0) return;

		// Date conversion logic
		//const isoPe = getDailyPeriodsByBsMonth(selectedPeriod); // Returns array of daily periods for selected bsmonth, adjust analyticsUrl accordingly
		const isoPe = getStartAndEndDatesByBsMonth(selectedPeriod);

		/*const analyticsUrl = `${baseUrl}/analytics.json?dimension=dx:${piIdsToQuery.join(";")}` +
			`&filter=ou:${selectedOrgUnit}` + `&filter=pe:${isoPe.join(";")}` + `&outputIdScheme=UID`;*/

		// ISO startDate and EndDate - when used getStartAndEndDatesByBsMonth
		const analyticsUrl =
			`${baseUrl}/api/analytics.json?dimension=dx:${piIdsToQuery.join(";")}` +
			`&filter=ou:${selectedOrgUnit}` +
			`&startDate=${isoPe.startDate}` +
			`&endDate=${isoPe.endDate}` +
			`&outputIdScheme=UID`;

		try {
			console.log("Getting local program indicator data");
			const res = await apiGet(analyticsUrl);
			const dataValues = [];

			console.log(
				"Setting data in respecitve input fields and preparing dataValues...",
			);

			res.rows.forEach((row) => {
				const dataPi = row[0];
				const dataValue = parseInt(row[1]);

				const pi = programIndicators.find((p) => p.id === dataPi);
				const cocId = pi.aggregateExportCategoryOptionCombo;

				const filteredPi = pi.attributeValues.find(
					(av) => av.attribute.id === "b8KbU93phhz",
				);

				const deId = filteredPi ? filteredPi.value : null;
				const el = document.getElementById(`${deId}-${cocId}-val`);

				if (el) {
					el.value = dataValue;
				}

				if (!isNaN(dataValue) && dataValue !== 0) {
					dataValues.push({
						dataElement: deId,
						categoryOptionCombo: cocId,
						value: dataValue,
					});
				}
			});

			console.log("Preparing final JSON...");

			finalJSON = {
				dataSet: selectedDataset,
				orgUnit: hmisOuId,
				period: selectedPeriod,
				completeDate: new Date().toISOString().substring(0, 10),
				dataValues: dataValues,
			};
		} catch (e) {
			showError("Error getting program indicator data...");
		}
	}

	async function submitData() {
		console.log("Submitting data to HMIS...");

		try {
			const res = await apiPost(`${hmisBaseUrl}/api/dataValueSets`, finalJSON, {
				headers: getAuthHeader(),
			});

			// Check response details
			// To Do
			console.log(res);
			$("#submissionStatus").html("Data successfully submitted to HMIS!");
		} catch (e) {
			$("#submissionStatus").html(
				"Failed to submit data to HMIS. Please ask for technical support.",
			);
		}
	}

	async function checkDatasetCompleteness() {
		try {
			console.log("Checking data set status...");

			if (!selectedDataset || !hmisOuId || !selectedPeriod) {
				console.log("Missing parameters...");
				return;
			}

			const orgUnit = $("#orgUnitList").val();
			const url = `${hmisBaseUrl}/api/completeDataSetRegistrations?dataSet=${selectedDataset}&period=${selectedPeriod}&orgUnit=${hmisOuId}`;
			const res = await apiGet(url, { headers: getAuthHeader() });
			if (
				res.completeDataSetRegistrations &&
				res.completeDataSetRegistrations.length > 0
			) {
				const cds = res.completeDataSetRegistrations[0];
				const completedDate = cds.date || "NA";
				const completedBy = cds.storedBy || "NA";
				$("#submissionStatus").html(
					`<div>Already submitted on <strong>${completedDate}</strong> by <strong>${completedBy}</strong>. Submitting again will overwrite non-zero values.</div>`,
				);
			} else {
				$("#submissionStatus").html(`<div>Not yet submitted</div>`);
			}
		} catch (e) {
			showError("Error checking completeness");
		}
	}

	function getDailyPeriodsByBsMonth(period) {
		console.log("Generating ISO periods for the selected month...");

		const year = period.substring(0, 4);
		const month = period.substring(4, 6);

		const dates = [];
		let day = 1;
		let continueLoop = true;
		while (continueLoop) {
			const bsDate = `${year}-${month}-${String(day).padStart(2, "0")}`;
			try {
				if (NepaliFunctions.BS.ValidateDate(bsDate)) {
					const isoDate = NepaliFunctions.BS2AD(bsDate);
					dates.push(isoDate.replace(/-/g, ""));
					day++;
				} else {
					continueLoop = false;
				}
			} catch (e) {
				console.log("ERROR in period generation: " + e);
			}
		}
		return dates;
	}

	function getStartAndEndDatesByBsMonth(period) {
		console.log("Generating ISO start and end dates for the selected month...");

		const year = period.substring(0, 4);
		const month = period.substring(4, 6);

		const dates = [];
		let start = 1;
		const bsStartDate = `${year}-${month}-${String(start).padStart(2, "0")}`;
		const adStartDate = NepaliFunctions.BS.ValidateDate(bsStartDate)
			? NepaliFunctions.BS2AD(bsStartDate)
			: null;

		const bsEndDate = `${year}-${month}-${String(NepaliFunctions.BS.GetDaysInMonth(year, month)).padStart(2, "0")}`;
		const adEndDate = NepaliFunctions.BS.ValidateDate(bsEndDate)
			? NepaliFunctions.BS2AD(bsEndDate)
			: null;

		return {
			startDate: adStartDate,
			endDate: adEndDate,
		};
	}

	/* UI EVENTS */
	$(document).on("click", "#prev", function () {
		var year = parseInt($("#period").val().substring(0, 4)) - 1;
		loadPeriod(year);
	});

	$(document).on("click", "#next", function () {
		var year = parseInt($("#period").val().substring(0, 4)) + 1;
		loadPeriod(year);
	});

	$(document).on("click", "#loginBtn", async function () {
		const user = $("#hmisUser").val();
		const pass = $("#hmisPass").val();

		if (!user || !pass) {
			alert("Enter username and password");
			return;
		}

		const encodedCredentials = btoa(user + ":" + pass);
		const res = await apiGet(`${hmisBaseUrl}/api/me.json`, {
			headers: { Authorization: "Basic " + encodedCredentials },
		});

		console.log(res);

		sessionStorage.setItem("tempCreds", encodedCredentials);

		await init();

		$("#loginPanel").hide();
		$("#showLoginBtn").show();
		$("#loadDataPanel").show();
	});

	$(document).on("click", "#loadData", async function () {
		$(this).text("Loading...");
		$("#loadData").prop("disabled", true);
		await loadSelectedDatasetForm();
	});

	$(document).on("click", "#showLoginBtn", function () {
		$("#loginPanel").show();
		$(this).hide();
	});

	$(document).on("click", "#hideLoginBtn", function () {
		$("#loginPanel").hide();
		$("#showLoginBtn").show();
	});

	$(document).on("change", "#period", function () {
		selectedPeriod = $("#period").val();
	});

	$(document).on("change", "#orgUnitList", async function () {
		selectedOrgUnit = $("#orgUnitList").val();
		selectedOrgUnitCode = $("#orgUnitList option:selected").attr("data-code");
		await getRemoteOrgUnitIdByCode(selectedOrgUnitCode);
	});

	$(document).on("change", "#datasetList", function () {
		selectedDataset = $("#datasetList").val();
		selectedDatasetTitle = $("#datasetList option:selected").text();
	});

	$(document).on("click", "#submitDataBtn", async function () {
		await submitData();
	});

	// START
	init();
});
