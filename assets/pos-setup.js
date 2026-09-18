async function posSetupPage() {
  const host = document.querySelector('#posSetupAdmin');
  const user = currentForgeUser();
  if (!host) return;
  if (!user || user.role !== 'admin' && user.role !== 'pos_manager') {
    host.innerHTML = '<h2>POS setup</h2><p class="small">Only a POS manager can change locations, events or staff access.</p>';
    return;
  }
  let locations = [], events = [], users = [];
  const today = new Date().toISOString().slice(0, 10);
  async function refresh() {
    const [loc, ev, people] = await Promise.all([cloudFetch('/pos/locations'), cloudFetch('/pos/events'), cloudFetch('/users')]);
    locations = loc.locations || []; events = ev.events || []; users = people.users || [];
  }
  function render() {
    const posUsers = users.filter(x => ['admin', 'pos_manager', 'pos_staff'].includes(x.role) && Number(x.active) === 1);
    host.innerHTML = `<div class="section-title"><div><h2>POS administration</h2><div class="small">Every card or cash sale is tied to one location, event and employee.</div></div><span class="badge ok">TEST SETUP</span></div>
      <div class="employee-create-card"><h3>Locations</h3><div class="employee-create-grid"><label><span>Location ID</span><input id="posLocationId" placeholder="e.g. festival-van"></label><label><span>Display name</span><input id="posLocationName" placeholder="e.g. Festival Van"></label><label><span>Stripe Terminal location ID</span><input id="posStripeLocation" placeholder="Added after Stripe setup"></label><button class="btn" id="savePosLocation">Add location</button></div><div class="employee-role-help">${locations.map(x => `<div><strong>${esc(x.name)}</strong><span>${esc(x.id)}${x.stripe_terminal_location_id ? ' · Stripe linked' : ' · Stripe pending'}</span></div>`).join('')}</div></div>
      <div class="employee-create-card"><h3>Events</h3><div class="employee-create-grid"><label><span>Event name</span><input id="posEventName" placeholder="e.g. Falmouth Market"></label><label><span>Date</span><input id="posEventDate" type="date" value="${today}"></label><label><span>Location</span><select id="posEventLocation"><option value="">Any location</option>${locations.filter(x => Number(x.active) === 1).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label><button class="btn" id="savePosEvent">Add event</button></div><div class="employee-role-help">${events.slice(0,12).map(x => `<div><strong>${esc(x.name)}</strong><span>${esc(x.event_date)} · ${esc(x.location_name || 'Any location')}</span></div>`).join('') || '<div><span>No events yet.</span></div>'}</div></div>
      <div class="employee-create-card"><h3>POS staff access</h3><div class="employee-create-grid"><label><span>Employee</span><select id="posEmployee"><option value="">Choose employee</option>${posUsers.map(x => `<option value="${esc(x.id)}">${esc(x.name || x.email)} · ${esc(x.role)}</option>`).join('')}</select></label><label><span>Allowed locations</span><div id="posAssignmentLocations">${locations.filter(x => Number(x.active) === 1).map(x => `<label style="display:inline-flex;gap:6px;margin:6px 12px 0 0"><input type="checkbox" value="${esc(x.id)}"> ${esc(x.name)}</label>`).join('')}</div></label><button class="btn" id="savePosAssignment">Save staff access</button></div><p class="small">Create POS Staff or POS Manager accounts from Employees. Administrators already have access everywhere.</p></div>`;
    host.querySelector('#savePosLocation').onclick = async () => {
      const id = host.querySelector('#posLocationId').value.trim(), name = host.querySelector('#posLocationName').value.trim(), stripe_terminal_location_id = host.querySelector('#posStripeLocation').value.trim();
      if (!id || !name) return alert('Enter a location ID and display name.');
      try { await cloudFetch('/pos/locations', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,name,stripe_terminal_location_id}) }); await refresh(); render(); } catch (e) { alert(e.message); }
    };
    host.querySelector('#savePosEvent').onclick = async () => {
      const name = host.querySelector('#posEventName').value.trim(), event_date = host.querySelector('#posEventDate').value, location_id = host.querySelector('#posEventLocation').value;
      if (!name || !event_date) return alert('Enter an event name and date.');
      try { await cloudFetch('/pos/events', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,event_date,location_id}) }); await refresh(); render(); } catch (e) { alert(e.message); }
    };
    host.querySelector('#savePosAssignment').onclick = async () => {
      const user_id = host.querySelector('#posEmployee').value, location_ids = [...host.querySelectorAll('#posAssignmentLocations input:checked')].map(x => x.value);
      if (!user_id || !location_ids.length) return alert('Choose a POS employee and at least one location.');
      try { await cloudFetch('/pos/employee-locations', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id,location_ids}) }); alert('POS locations saved for this employee.'); } catch (e) { alert(e.message); }
    };
  }
  try { await refresh(); render(); } catch (e) { host.innerHTML = `<h2>POS setup could not load</h2><p class="small">${esc(e.message)}</p>`; }
}
