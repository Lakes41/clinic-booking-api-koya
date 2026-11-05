const slotsContainer = document.querySelector('#slots');
const providerInput = document.querySelector('#provider');
const selectedText = document.querySelector('#selected-slot');
const form = document.querySelector('#booking-form');
const submitButton = document.querySelector('#book-button');
const confirmation = document.querySelector('#confirmation');
const confirmationDetails = document.querySelector('#confirmation-details');
const confirmationTitle = document.querySelector('#confirmation-title');
const confirmationMessage = document.querySelector('#confirmation-message');
const cancelButton = document.querySelector('#cancel-button');
const errorMessage = document.querySelector('#error-message');
let selectedSlot = null;
let latestBookingId = null;
let apiKey = ''; // Do not embed a server secret in public JavaScript.

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function prettyTime(value) {
  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium', timeStyle: 'short'
  });
}

async function api(url, options = {}) {
  if (!apiKey) throw new Error('Enter your API key first.');
  const headers = new Headers(options.headers || {});
  headers.set('X-API-Key', apiKey);
  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadSlots() {
  showError('');
  slotsContainer.textContent = 'Loading slots…';
  if (!apiKey) {
    slotsContainer.textContent = 'Enter your API key above to view appointments.';
    return;
  }
  try {
    const provider = providerInput.value;
    const url = provider ? `/slots?provider=${encodeURIComponent(provider)}` : '/slots';
    const data = await api(url);
    slotsContainer.replaceChildren();
    const available = data.slots.filter((slot) =>
      slot.available && new Date(slot.start).getTime() > Date.now()
    );
    if (available.length === 0) {
      slotsContainer.textContent = 'No upcoming appointments are available.';
      return;
    }
    for (const slot of available) {
      const item = document.createElement('div');
      item.className = 'slot';
      const description = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = slot.provider;
      const time = document.createElement('small');
      time.textContent = `${prettyTime(slot.start)} to ${prettyTime(slot.end)}`;
      description.append(name, time);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Select slot';
      button.addEventListener('click', () => {
        selectedSlot = slot;
        selectedText.textContent = `${slot.provider}: ${prettyTime(slot.start)}`;
        submitButton.disabled = false;
        document.querySelectorAll('.slot').forEach((row) => row.classList.remove('selected'));
        item.classList.add('selected');
        showError('');
      });
      item.append(description, button);
      slotsContainer.append(item);
    }
  } catch (error) {
    slotsContainer.textContent = 'Unable to load available slots.';
    showError(error.message);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedSlot) return;
  showError('');
  submitButton.disabled = true;
  try {
    const booking = await api('/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: selectedSlot.id,
        name: document.querySelector('#patient-name').value,
        email: document.querySelector('#patient-email').value
      })
    });
    latestBookingId = booking.id;
    confirmationTitle.textContent = 'Booking confirmed';
    confirmationMessage.textContent = 'Your appointment has been reserved.';
    cancelButton.hidden = false;
    cancelButton.disabled = false;
    confirmationDetails.replaceChildren();
    for (const [label, value] of [
      ['Booking ID', booking.id],
      ['Name', booking.name],
      ['Email', booking.email],
      ['Status', booking.status],
      ['Slot', `${selectedSlot.provider}, ${prettyTime(selectedSlot.start)}`]
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      confirmationDetails.append(dt, dd);
    }
    confirmation.hidden = false;
    selectedSlot = null;
    selectedText.textContent = 'Select another slot to book again.';
    await loadSlots();
    confirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    submitButton.disabled = false;
    await loadSlots();
    showError(error.message);
  }
});

cancelButton.addEventListener('click', async () => {
  if (!latestBookingId) return;
  cancelButton.disabled = true;
  showError('');
  try {
    const booking = await api(`/bookings/${encodeURIComponent(latestBookingId)}`, {
      method: 'DELETE'
    });
    confirmationTitle.textContent = 'Booking cancelled';
    confirmationMessage.textContent = 'This appointment is available to book again.';
    const status = confirmationDetails.querySelector('dd:nth-of-type(4)');
    if (status) status.textContent = booking.status;
    cancelButton.hidden = true;
    latestBookingId = null;
    await loadSlots();
  } catch (error) {
    cancelButton.disabled = false;
    showError(error.message);
  }
});

document.querySelector('#api-key-form').addEventListener('submit', (event) => {
  event.preventDefault();
  apiKey = document.querySelector('#api-key-input').value.trim();
  selectedSlot = null;
  submitButton.disabled = true;
  selectedText.textContent = 'Select an available slot above to book it.';
  loadSlots();
});

document.querySelector('#refresh').addEventListener('click', loadSlots);
providerInput.addEventListener('change', loadSlots);
loadSlots();
