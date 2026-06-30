$(document).ready(function () {
	const todayNP = NepaliFunctions.BS.GetCurrentDate();

	const npMonth = todayNP.month - 1 == 0 ? 12 : todayNP.month;
	const npYear = todayNP.month - 1 == 0 ? todayNP.year - 1 : todayNP.year;

	const hmisBaseUrl = "https://hmis.gov.np/hmisdemo";
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

	let selectedOrgUnit = null;
	let selectedOrgUnitCode = null;

	let hmisOuId = null;

	let finalJSON = {};

	/*selection.setListenerFunction(function (e) {
		selectedOrgUnit = e[0];
		//var selectedOrgUnitName = document.getElementsByClassName("selected")[0].innerHTML;
		getSelectedOrgUnitInfo(e[0]);
	});

	// Organization Unit search
	$("#searchField").autocomplete({
		source:
			"../../../../dhis-web-commons/ouwt/getOrganisationUnitsByName.action",
		select: function (event, ui) {
			$("#searchField").val(ui.item.value);
			selection.findByName();
		},
	});*/

	/* OAuth */
	var OAUTH = {
		clientId: "ephc",
		clientSecret: "f9c016052-c436-6d9b-0f4c-e3c0d0dd6fa",
		baseUrl: hmisBaseUrl,
		authUrl: hmisBaseUrl + "/uaa/oauth/authorize",
		tokenUrl: hmisBaseUrl + "/uaa/oauth/token",
		redirectUri: baseUrl + "/api/apps/HMIS-Reporting/index.html",
		scope: "ALL",
	};

	var params = new URLSearchParams(window.location.search);
	var code = params.get("code");
	var state = params.get("state");
	var error = params.get("error");

	if (error) {
		toastr.error("OAuth error");
		return;
	}

	if (code) {
		// ← came back from DHIS2 with auth code
		handleOAuthCallback(code, state);
		return;
	}

	// Check if already logged in
	var token = sessionStorage.getItem("access_token");
	if (token && !isTokenExpired()) {
		$.ajaxSetup({
			headers: { Authorization: "Bearer " + token },
			timeout: 10000,
		});
	} else {
	}

	$(document).on("click", "#btnLogin", function () {
		var state = Math.random().toString(36).substring(2);
		sessionStorage.setItem("oauth_state", state);

		var params = new URLSearchParams({
			response_type: "code",
			client_id: OAUTH.clientId,
			redirect_uri: OAUTH.redirectUri,
			scope: OAUTH.scope,
			state: state,
		});

		//window.location.href = OAUTH.authUrl + '?' + params.toString()
		window.open(OAUTH.authUrl + "?" + params.toString(), "_blank");
	});

	// ── Handle callback — exchange code for token ──
	function handleOAuthCallback(code, state) {
		var savedState = sessionStorage.getItem("oauth_state");

		if (state !== savedState) {
			toastr.error("Invalid state. Please try again.");
			return;
		}

		sessionStorage.removeItem("oauth_state");

		// Clean URL — remove code and state from address bar
		window.history.replaceState({}, document.title, window.location.pathname);

		toastr.info("Authenticating...");

		$.ajax({
			url: "https://ocl.hmis.gov.np/ephc/api/42/routes/LCNvyLXukMq/run",
			method: "POST",
			headers: {
				/*'Authorization': 'Basic ' + btoa(OAUTH.clientId + ':' + OAUTH.clientSecret),*/
				"Content-Type": "application/x-www-form-urlencoded",
			},
			data: {
				grant_type: "authorization_code",
				code: code,
				redirect_uri: OAUTH.redirectUri,
			},
		})
			.done(function (data) {
				// Store token
				sessionStorage.setItem("access_token", data.access_token);
				sessionStorage.setItem("refresh_token", data.refresh_token);
				sessionStorage.setItem(
					"expires_at",
					Date.now() + data.expires_in * 1000,
				);

				// Set globally
				$.ajaxSetup({
					headers: { Authorization: "Bearer " + data.access_token },
					timeout: 10000,
				});

				showToast("Login successful!", "success");
			})
			.fail(function (xhr) {
				toastr.error("Authentication failed");
			});
	}

	// ── Token helpers ──
	function isTokenExpired() {
		var expiresAt = sessionStorage.getItem("expires_at");
		if (!expiresAt) return true;
		return Date.now() > expiresAt - 60 * 1000; // 1 min buffer
	}

	function refreshAccessToken() {
		var refreshToken = sessionStorage.getItem("refresh_token");
		if (!refreshToken) {
			return;
		}

		$.ajax({
			url: OAUTH.tokenUrl,
			method: "POST",
			headers: {
				Authorization:
					"Basic " + btoa(OAUTH.clientId + ":" + OAUTH.clientSecret),
				"Content-Type": "application/x-www-form-urlencoded",
			},
			data: {
				grant_type: "refresh_token",
				refresh_token: refreshToken,
			},
		})
			.done(function (data) {
				sessionStorage.setItem("access_token", data.access_token);
				sessionStorage.setItem(
					"expires_at",
					Date.now() + data.expires_in * 1000,
				);
				$.ajaxSetup({
					headers: { Authorization: "Bearer " + data.access_token },
				});
			})
			.fail(function () {
				sessionStorage.clear();
				showLogin();
			});
	}

	// ── Auto refresh check on every request ──
	$(document).ajaxSend(function () {
		if (isTokenExpired()) refreshAccessToken();
	});

	// ── Logout ──
	function logout() {
		sessionStorage.clear();
		$.ajaxSetup({ headers: {} });
		showLogin();
	}
	/* End OAuth */

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
			toastr.info("Please login using your HMIS credentials");
			$("#loginPanel").show();
			$("#showLoginBtn").hide();
			$("#loadData").hide();
		}
	}

	function getAuthHeader() {
		return {
			Authorization: "Basic " + sessionStorage.getItem("tempCreds"),
		};
	}

	async function loginToTargetSystem(user, pass) {
		const encodedCredentials = btoa(user + ":" + pass);
		const res = await apiGet(`${hmisBaseUrl}/api/me.json`, {
			headers: { Authorization: "Basic " + encodedCredentials },
		});

		if (res) {
			//sessionStorage.setItem("tempCreds", encodedCredentials);
			sessionStorage.setItem("tempCreds", encodedCredentials);
			toastr.success("Login successful");

			await init();

			$("#loginPanel").hide();
			$("#showLoginBtn").show();
			$("#loadDataPanel").show();
		} else {
			toastr.error("Login failed. Please check your credentials.");
		}
	}

	async function apiGet(url, options = {}) {
		console.log(options);
		return $.ajax({
			url,
			method: "GET",
			contentType: options.contentType || "application/json",
			headers: options.headers || {},
			timeout: options.timeout || 10000,
		}).fail(function (xhr, textStatus) {
			if (textStatus === "timeout") {
				toastr.error(`Request timed out: ${url}`, "Request Timed Out");
			} else {
				toastr.error(`Error getting data: ${url}`, "Error");
			}
		});
	}

	async function apiPost(url, data, options = {}) {
		toastr.info("Sending your data...");
		return $.ajax({
			url,
			method: "POST",
			contentType: "application/json",
			headers: options.headers || {},
			data: JSON.stringify(data),
		}).fail(function (xhr, textStatus) {
			if (textStatus === "timeout") {
				toastr.error("Request timed out:", url);
			} else {
				toastr.error(`${xhr.responseText}`, "Error Submitting Data");
			}
		});
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
			const res = await apiGet(hmisUrl, {
				headers: getAuthHeader(),
			});

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
			console.log("Error getting data sets.");
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
			toastr.error("Error getting selected OrgUnit info...");
		}
	}

	async function loadUserOrgUnitList() {
		$("#orgUnitList").empty();
		var $container = $("#orgUnitTree");
		
		try {
			const res = await apiGet(
				`${baseUrl}/api/me.json?fields=organisationUnits[id,name,displayName,code,children::isNotEmpty]`,
			);

			if (!res) {
				console.log("Could not get user OrgUnit info...");
			} else {
				// Build dropdown list
				/*res.organisationUnits.forEach((ou) => {
					$("#orgUnitList").append(
						$("<option></option>")
							.text(ou.name)
							.val(ou.id)
							.attr("data-code", ou.code),
					);
				});*/
				
				// ---------------------------------
				// Build orgUnit tree
				var $ul = $('<ul class="ou-tree">');

				// Render each root org unit
				res.organisationUnits.forEach(function (ou) {
					var $li = buildOrgUnitNode(ou);
					$ul.append($li);
				});

				$container.append($ul);
				// ---------------------------------
			}
		} catch (e) {
			toastr.error("Error loading OrgUnit list...");
		}
	}

	async function getRemoteOrgUnitIdByCode(code) {
		try {
			const res = await apiGet(
				`${hmisBaseUrl}/api/organisationUnits?filter=code:eq:${code}&fields=id,name,code`,
				{
					headers: getAuthHeader(),
				},
			);

			if (res.organisationUnits && res.organisationUnits.length > 0) {
				hmisOuId = res.organisationUnits[0].id;
			} else {
				toastr.info(`HMIS does not have OrgUnit with code: ${code}`);
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
			/*await getRemoteOrgUnitIdByCode(
				$("#orgUnitList option:selected").data("code"),
			);*/

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
		toastr.info("Please wait, populating data...");
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

		// const isoPe = getIsoPeriodsByBsMonth(selectedPeriod, 'dailyPeriods');
		const isoPe = getIsoPeriodsByBsMonth(selectedPeriod, "startEndDates");

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
			console.log(finalJSON);
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

			//const orgUnit = $("#orgUnitList").val();
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

	function getIsoPeriodsByBsMonth(bsMonth, returnType) {
		console.log("Generating ISO periods for the selected month...");

		const year = bsMonth.substring(0, 4);
		const month = bsMonth.substring(4, 6);

		if (returnType == "dailyPeriods") {
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
		} else if (returnType == "startEndDates") {
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
		} else {
			console.log("Invalid return type for period");
		}

		return dates;
	}

	// Build a single orgUnit node
	function buildOrgUnitNode(ou) {
		var $li = $('<li class="ou-item">');
		var $row = $(
			`<div class="ou-row">
							${ou.children ? '<span class="ou-toggle">⊞</span>' : '<span class="ou-spacer"></span>'}
							<span class="ou-name"
									data-id="${ou.id}"
									data-code="${ou.code || ""}"
									data-name="${ou.displayName}">
									${ou.displayName}
							</span>
					</div>`,
		);

		$li.append($row);

		// Lazy load children on expand
		if (ou.children) {
			var $childContainer = $(
				'<div class="ou-children" style="display:none; padding-left:16px;">',
			);
			var loaded = false;

			$row.find(".ou-toggle").on("click", function () {
				var $toggle = $(this);
				$childContainer.toggle();
				$toggle.text($childContainer.is(":visible") ? "⊟" : "⊞");

				if (!loaded) {
					loaded = true;
					loadChildren(ou.id, $childContainer);
				}
			});

			$li.append($childContainer);
		}

		return $li;
	}

	// Load orgUnit children lazily
	function loadChildren(parentId, $container) {
		$container.html(
			'<span style="color:#aaa; font-size:11px; padding-left:8px;">Loading...</span>',
		);

		$.ajax({
			url: `${baseUrl}/api/organisationUnits/${parentId}.json`,
			data: {
				fields:
					"id,displayName,code,children[id,displayName,code,children::isNotEmpty]",
				paging: false,
			},
		}).done(function (data) {
				$container.empty();
				var $ul = $('<ul class="ou-tree">');
				//Sort by name
				data.children.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
				data.children.forEach(function (ou) {
					$ul.append(buildOrgUnitNode(ou));
				});

				$container.append($ul);
			})
			.fail(function () {
				$container.html(
					'<span style="color:red; font-size:11px;">Failed to load.</span>',
				);
			});
	}

	// previous and next year
	$(document).on("click", "#prev", function () {
		var year = parseInt($("#period").val().substring(0, 4)) - 1;
		loadPeriod(year);
	});

	$(document).on("click", "#next", function () {
		var year = parseInt($("#period").val().substring(0, 4)) + 1;
		loadPeriod(year);
	});

	$(document).on("click", "#loginBtn", async function () {
		$("#orgUnitTree").empty();
		const user = $("#hmisUser").val();
		const pass = $("#hmisPass").val();

		if (!user || !pass) {
			toastr.warning("Enter username and password");
			return;
		}

		await loginToTargetSystem(user, pass);
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

	// Handle orgUnit selection
	$(document).on("click", ".ou-name", async function () {
		$(".ou-name").removeClass("selected");
		$(this).addClass("selected");
		selectedOrgUnit = $(this).data("id");
		var code = $(this).data("code");

		if (!code) {
			toastr.warning(
				"Selected OrgUnit does not have a code, data will not be submitted to HMIS",
			);
		} else {
			await getRemoteOrgUnitIdByCode(code);
			console.log(`Resolved orgUnitId: ${hmisOuId}`);
		}
	});

	// orgUnit search
	$("#searchField").on("input", function () {
		var query = $(this).val().trim().toLowerCase();

		if (!query) {
			// Reset — show all, restore expanded state
			$(".ou-item").removeClass("ou-hidden");
			return;
		}

		// Hide all first
		$(".ou-item").addClass("ou-hidden");

		// Show matching nodes and their parents
		$(".ou-name").each(function () {
			if ($(this).text().toLowerCase().indexOf(query) > -1) {
				var $item = $(this).closest(".ou-item");

				// Show match
				$item.removeClass("ou-hidden");

				// Show all ancestors
				$item.parents(".ou-item").removeClass("ou-hidden");

				// Expand all ancestor children containers
				$item.parents(".ou-children").show();

				// Highlight match
				var text = $(this).text();
				var idx = text.toLowerCase().indexOf(query);
				$(this).html(
					text.slice(0, idx) +
						"<mark>" +
						text.slice(idx, idx + query.length) +
						"</mark>" +
						text.slice(idx + query.length),
				);
			}
		});
	});

	// START
	init();
});
