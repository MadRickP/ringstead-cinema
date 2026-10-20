(() => {
  const seats = Array.from({length:5},(_,r)=>String.fromCharCode(65+r)).flatMap(r=>Array.from({length:7},(_,i)=>`${r}${i+1}`));
  const config = window.RINGSTEAD_CONFIG || {};
  const demoKey = `ringstead-demo-${config.screeningId || 'holy-days-2026-11-06'}`;
  let reserved = new Set(); let selected = new Set(); let client = null;
  const $ = s => document.querySelector(s);
  function isLive(){return !!(config.supabaseUrl && config.supabaseAnonKey && window.supabase)}
  async function init(){
    renderSeats();
    if(isLive()) client=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
    await refresh();
    bind();
  }
  async function refresh(){
    try{
      if(isLive()){
        const {data,error}=await client.rpc('get_reserved_seats',{p_screening_id:config.screeningId});
        if(error) throw error; reserved=new Set((data||[]).map(x=>x.seat_id));
        $('#booking-status').textContent='Live availability';
      }else{
        reserved=new Set(JSON.parse(localStorage.getItem(demoKey)||'[]')); $('#booking-status').textContent='Demo availability';
      }
    }catch(e){console.error(e);$('#booking-status').textContent='Availability unavailable';}
    renderSeats(); updateSelection();
  }
  function renderSeats(){
    const map=$('#seat-map'); if(!map)return; map.innerHTML='';
    map.appendChild(Object.assign(document.createElement('div'),{className:'row-label'}));
    for(let n=1;n<=7;n++) map.appendChild(Object.assign(document.createElement('div'),{className:'row-label',textContent:n}));
    for(const row of ['A','B','C','D','E']){
      const label=document.createElement('div');label.className='row-label';label.textContent=row;map.appendChild(label);
      for(let n=1;n<=7;n++){
        const id=`${row}${n}`, b=document.createElement('button'); b.type='button'; b.className='seat'; b.textContent=n; b.dataset.seat=id; b.setAttribute('aria-label',`Seat ${id}`);
        if(reserved.has(id)){b.classList.add('reserved');b.disabled=true}else if(selected.has(id))b.classList.add('selected');
        b.addEventListener('click',()=>{if(reserved.has(id))return; selected.has(id)?selected.delete(id):selected.add(id); renderSeats(); updateSelection();}); map.appendChild(b);
      }
    }
  }
  function updateSelection(){
    const list=$('#selected-seats'), total=$('#total'), cont=$('#continue-booking'), count=$('#availability-count'); if(!list)return;
    const available=Math.max(0,seats.length-reserved.size);
    if(count){
      count.textContent=selected.size
        ? `${available} seats available · ${selected.size} selected`
        : `${available} seats available`;
    }
    if(!selected.size) list.textContent='No seats selected yet.'; else list.innerHTML=Array.from(selected).sort().map(s=>`<span class="seat-chip">${s}</span>`).join('');
    total.textContent=`£${selected.size*5}`; cont.disabled=!selected.size;
  }
  function bind(){
    $('#continue-booking').addEventListener('click',()=>{$('#booking-form').classList.remove('hidden');$('#booking-form').scrollIntoView({behavior:'smooth',block:'start'});});
    $('#back-to-seats').addEventListener('click',()=>{$('#booking-form').classList.add('hidden');$('#reserve').scrollIntoView({behavior:'smooth'});});
    $('#booking-form').addEventListener('submit',submitBooking);
  }
async function submitBooking(ev) {
  ev.preventDefault();
  if (!selected.size) return;

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
    msg.textContent =
      e.message ||
      'Sorry, the reservation could not be completed. Please try again.';

    await refresh();
  }
}
  window.addEventListener('DOMContentLoaded',init);
})();
