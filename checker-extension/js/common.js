const templateCache = {};



async function loadTemplate(name) {
	try {
		const response = await fetch(`../tpl/${name}.html`);
		if (!response.ok) throw new Error(`Failed to load template: ${name}`);
		const template = await response.text();
		return template;
	} catch (error) {
		console.error('Error loading template:', error);
		return '';
	}
}


async function getTemplate(name) {
	if (!templateCache[name]) {
		templateCache[name] = await loadTemplate(name);
	}
	return templateCache[name];
}


async function updateStorageProgress() {
	const storageInfo = await checkStorageUsage();
	const progressBar = document.querySelector('.storage-progress .progress');
	const storageText = document.querySelector('.storage-text');
	
	if (progressBar && storageText) {
		progressBar.value = storageInfo.usagePercent;
		
		
		progressBar.classList.remove('is-primary', 'is-warning', 'is-danger');
		if (storageInfo.usagePercent >= 90) {
			progressBar.classList.add('is-danger');
		} else if (storageInfo.usagePercent >= 70) {
			progressBar.classList.add('is-warning');
		} else {
			progressBar.classList.add('is-primary');
		}
		
		
		storageText.textContent = `${storageInfo.usagePercent}% (${storageInfo.usageMB}MB used of ${storageInfo.totalMB}MB)`;
	}
}
