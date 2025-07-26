// User Info Modal utility
export function showUserInfoModalIfNeeded() {
    // Only show modal if info not already in sessionStorage
    if (sessionStorage.getItem('discordName') && sessionStorage.getItem('irlName')) return;

    // Create modal if not present
    let modal = document.getElementById('userInfoModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'userInfoModal';
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(0,0,0,0.55)';
        modal.style.zIndex = '9999';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.innerHTML = `
          <div style="background:#fff;padding:36px 32px 28px 32px;border-radius:18px;box-shadow:0 8px 32px rgba(30,60,90,0.18);min-width:320px;max-width:95vw;text-align:center;">
            <h2 style="margin-bottom:18px;">Enter Your Info</h2>
            <div style="margin-bottom:18px;">
              <label for="discordName" style="font-weight:bold;">Discord Name</label><br>
              <input id="discordName" type="text" style="width:90%;padding:10px 14px;margin-top:6px;border-radius:7px;border:1.5px solid #bbb;font-size:1.1em;" placeholder="e.g. JohnDoe#1234">
            </div>
            <div style="margin-bottom:18px;">
              <label for="irlName" style="font-weight:bold;">IRL Name</label><br>
              <input id="irlName" type="text" style="width:90%;padding:10px 14px;margin-top:6px;border-radius:7px;border:1.5px solid #bbb;font-size:1.1em;" placeholder="e.g. John Smith">
            </div>
            <button id="userInfoSubmitBtn" style="background:#1976d2;color:#fff;padding:12px 32px;border:none;border-radius:8px;font-weight:bold;font-size:1.15em;">Continue</button>
          </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.style.display = 'flex';
    }
    // Setup logic
    const discordNameInput = modal.querySelector('#discordName');
    const irlNameInput = modal.querySelector('#irlName');
    const userInfoSubmitBtn = modal.querySelector('#userInfoSubmitBtn');
    userInfoSubmitBtn.onclick = function() {
        const discordName = discordNameInput.value.trim();
        const irlName = irlNameInput.value.trim();
        if (!discordName || !irlName) {
            alert('Please enter both your Discord name and IRL name.');
            return;
        }
        sessionStorage.setItem('discordName', discordName);
        sessionStorage.setItem('irlName', irlName);
        modal.style.display = 'none';
    };
}
