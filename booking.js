
(() => {
  const seats = Array.from({length:5},(_,r)=>String.fromCharCode(65+r)).flatMap(r=>Array.from({length:7},(_,i)=>`${r}${i+1}`));
  const config = window.RINGSTEAD_CONFIG || {};
  const demoKey = `ringstead-demo-${config.screeningId || 'holy-days-2026-11-06'}`;
  let reserved = new Set();
  let selected = new Set();
  let client = null;
  let reservationsOpen = false;
  let refreshInProgress = false;
  const $ = s => document.querySelector(s);

  function isLive(){
    return !!(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  }

  async function init(){
    renderSeats();

    const bookingSection = $('#reserve');
    const bookingLayout = bookingSection?.querySelector('.booking-layout');
    const bookingForm = $('#booking-form');

    if (bookingLayout) bookingLayout.classList.add('hidden');
    if (bookingForm) bookingForm.classList.add('hidden');

    if (bookingSection && bookingLayout) {
      const notice = document.createElement('div');
      notice.id = 'reservation-closed';
      notice.className = 'content-section hidden';
      notice.setAttribute('role', 'status');
      bookingSection.insertBefore(notice, bookingLayout);
    }

    if (isLive()) {
      client = window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
    }

    bind();
    await refresh();

    // Recheck periodically so a page left open across noon closes automatically.
    window.setInterval(refresh, 30000);
  }

  function showReservationNotice(message){
    const notice = $('#reservation-closed');
    const bookingLayout = $('#reserve .booking-layout');
    const bookingForm = $('#booking-form');

    if (bookingLayout) bookingLayout.classList.add('hidden');
    if (bookingForm) bookingForm.classList.add('hidden');

    if (notice) {
      notice.innerHTML = message;
      notice.classList.remove('hidden');
    }
  }

  function showBookingInterface(){
    const notice = $('#reservation-closed');
    const bookingLayout = $('#reserve .booking-layout');

    if (notice) notice.classList.add('hidden');
    if (bookingLayout) bookingLayout.classList.remove('hidden');
  }

  async function refresh(){
    if (refreshInProgress) return;
    refreshInProgress = true;

    try {
      if (isLive()) {
        const {data:status,error:statusError} = await client.rpc(
          'get_reservation_status',
          {p_screening_id:config.screeningId}
        );

        if (statusError) throw statusError;

        reservationsOpen = status?.is_open === true;

        if (!reservationsOpen) {
          selected.clear();
          $('#booking-status').textContent = 'Reservations closed';

          const remaining = Number(status?.seats_remaining ?? 0);
          let message;

          if (remaining > 0) {
            message = `
              <div class="eyebrow">RESERVATIONS CLOSED</div>
              <h2>Online reservations have now closed for this showing.</h2>
              <p>There ${remaining === 1 ? 'is' : 'are'} still ${remaining} ${remaining === 1 ? 'seat' : 'seats'} available, so if you haven't booked, don't worry — just come along!</p>
              <p>Doors open at 7.00pm. The film starts at 7.30pm. Tickets are £5, including tea and coffee.</p>
            `;
          } else {
            message = `
              <div class="eyebrow">RESERVATIONS CLOSED</div>
              <h2>Online reservations have now closed for this showing.</h2>
              <p>We're sorry, but all seats are currently reserved.</p>
              <p>Doors open at 7.00pm. The film starts at 7.30pm.</p>
            `;
          }

          showReservationNotice(message);
          updateSelection();
          return;
        }

        showBookingInterface();

        const {data,error} = await client.rpc(
          'get_reserved_seats',
          {p_screening_id:config.screeningId}
        );

        if (error) throw error;
        reserved = new Set((data||[]).map(x=>x.seat_id));
        $('#booking-status').textContent = 'Live availability';
      } else {
        reservationsOpen = true;
        showBookingInterface();
        reserved = new Set(JSON.parse(localStorage.getItem(demoKey)||'[]'));
        $('#booking-status').textContent = 'Demo availability';
      }
    } catch(e) {
      console.error(e);
      reservationsOpen = false;
      $('#booking-status').textContent = 'Unable to check reservations';

      showReservationNotice(`
        <div class="eyebrow">RESERVATION STATUS UNAVAILABLE</div>
        <h2>We're unable to check online reservations just now.</h2>
        <p>Please try again shortly, or contact Ringstead Cinema if you need help.</p>
      `);
    } finally {
      renderSeats();
      updateSelection();
      refreshInProgress = false;
    }
  }

  function renderSeats(){
    const map=$('#seat-map');
    if(!map)return;
    map.innerHTML='';
    map.appendChild(Object.assign(document.createElement('div'),{className:'row-label'}));

    for(let n=1;n<=7;n++) {
      map.appendChild(Object.assign(document.createElement('div'),{className:'row-label',textContent:n}));
    }

    for(const row of ['A','B','C','D','E']){
      const label=document.createElement('div');
      label.className='row-label';
      label.textContent=row;
      map.appendChild(label);

      for(let n=1;n<=7;n++){
        const id=`${row}${n}`;
        const b=document.createElement('button');
        b.type='button';
        b.className='seat';
        b.textContent=n;
        b.dataset.seat=id;
        b.setAttribute('aria-label',`Seat ${id}`);

        if(reserved.has(id)){
          b.classList.add('reserved');
          b.disabled=true;
        } else if(selected.has(id)) {
          b.classList.add('selected');
        }

        b.addEventListener('click',()=>{
          if(!reservationsOpen || reserved.has(id))return;
          selected.has(id)?selected.delete(id):selected.add(id);
          renderSeats();
          updateSelection();
        });

        map.appendChild(b);
      }
    }
  }

  function updateSelection(){
    const list=$('#selected-seats');
    const total=$('#total');
    const cont=$('#continue-booking');
    const count=$('#availability-count');
    if(!list)return;

    const available=Math.max(0,seats.length-reserved.size);

    if(count){
      count.textContent=selected.size
        ? `${available} seats available · ${selected.size} selected`
        : `${available} seats available`;
    }

    if(!selected.size) {
      list.textContent='No seats selected yet.';
    } else {
      list.innerHTML=Array.from(selected).sort().map(s=>`<span class="seat-chip">${s}</span>`).join('');
    }

    total.textContent=`£${selected.size*5}`;
    cont.disabled=!selected.size || !reservationsOpen;
  }

  function bind(){
    $('#continue-booking').addEventListener('click',()=>{
      if(!reservationsOpen)return;
      $('#booking-form').classList.remove('hidden');
      $('#booking-form').scrollIntoView({behavior:'smooth',block:'start'});
    });

    $('#back-to-seats').addEventListener('click',()=>{
      $('#booking-form').classList.add('hidden');
      $('#reserve').scrollIntoView({behavior:'smooth'});
    });

    $('#booking-form').addEventListener('submit',submitBooking);
  }

  async function submitBooking(ev) {
    ev.preventDefault();
    if (!selected.size || !reservationsOpen) return;

    const form = ev.currentTarget;
    const fd = new FormData(form);
    const msg = $('#form-message');

    msg.textContent = 'Making your reservation…';

    try {
      const chosen = Array.from(selected).sort();
      let bookingId = null;

      if (isLive()) {
        const { data, error } = await client.rpc('reserve_seats', {
          p_screening_id: config.screeningId,
          p_seat_ids: chosen,
          p_name: fd.get('name'),
          p_email: fd.get('email'),
          p_phone: fd.get('phone')
        });

        if (error) throw error;

        if (!data?.success) {
          throw new Error(
            data?.message || 'Those seats are no longer available.'
          );
        }

        bookingId = data.booking_id;

        // The reservation has succeeded. Send the confirmation email.
        // An email failure must NOT make a successful booking look like a failure.
        if (bookingId) {
          try {
            const emailResponse = await fetch(
              `${config.supabaseUrl}/functions/v1/send-booking-confirmation`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': config.supabaseAnonKey
                },
                body: JSON.stringify({
                  booking_id: bookingId
                })
              }
            );

            const emailResult = await emailResponse.json();

            if (!emailResponse.ok || !emailResult?.success) {
              console.error(
                'Booking confirmation email failed:',
                emailResult
              );
            }
          } catch (emailError) {
            console.error(
              'Booking confirmation email failed:',
              emailError
            );
          }
        }
      } else {
        const now = new Set(
          JSON.parse(localStorage.getItem(demoKey) || '[]')
        );

        for (const s of chosen) now.add(s);

        localStorage.setItem(
          demoKey,
          JSON.stringify([...now])
        );
      }

      msg.textContent =
        `Reservation confirmed for ${chosen.join(', ')}. Please pay £${chosen.length * 5} on arrival.`;

      selected.clear();
      form.reset();

      await refresh();

    } catch (e) {
      await refresh();

      msg.textContent = !reservationsOpen
        ? 'Online reservations have now closed for this showing. Please come along and pay on the door, subject to availability.'
        : (e.message || 'Sorry, the reservation could not be completed. Please try again.');
    }
  }

  window.addEventListener('DOMContentLoaded',init);
})();
