function selectRole(role) {
  localStorage.setItem('userRole', role);

  if (role === 'civilian') {
    const savedCivilians = JSON.parse(localStorage.getItem('civilians')) || [];
    if (savedCivilians.length > 0) {
      // Redirect to the civilian page with saved characters
      window.location.href = `civilian/civilian.html?saved=true`;
      return;
    }
  }

  // Redirect to the selected role's dashboard
  window.location.href = `${role}/${role}.html`;
}
