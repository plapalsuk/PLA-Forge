function bindGoogleDriveBoxSync(button, status, onComplete) {
  if (!button || !status) return;
  async function monitor() {
    const result = await cloudFetch('/box-files/sync-google-drive/status');
    const state = String(result.state || 'idle');
    if (state === 'running') {
      status.textContent = `Syncing directly on the Pi… ${Number(result.copied || 0)} copied, ${Number(result.unchanged || 0)} already current.`;
      window.setTimeout(() => monitor().catch(failed), 1800);
      return;
    }
    if (state === 'failed') throw new Error(result.error || 'Google Drive sync failed.');
    const copied = Number(result.copied || 0), unchanged = Number(result.unchanged || 0), missing = Array.isArray(result.missing) ? result.missing : [];
    status.textContent = `Google Drive sync complete: ${copied} copied or updated, ${unchanged} already current${missing.length ? ` · Missing: ${missing.join(', ')}` : ''}.`;
    if (onComplete) await onComplete();
    button.disabled = false;
    button.textContent = 'Sync active Pals from Google Drive';
  }
  function failed(error) {
    status.textContent = error.message || 'Google Drive sync failed.';
    button.disabled = false;
    button.textContent = 'Sync active Pals from Google Drive';
  }
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = 'Starting Google Drive sync…';
    status.textContent = 'The Pi is checking Pals enabled for sale in Forge and will download changed artwork directly from Google Drive.';
    try {
      await cloudFetch('/box-files/sync-google-drive', { method: 'POST' });
      await monitor();
    } catch (error) {
      failed(error);
    }
  };
}
