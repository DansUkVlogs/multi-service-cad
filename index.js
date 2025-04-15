function selectRole(role) {
    localStorage.setItem('userRole', role);
    window.location.href = `${role}/${role}.html`; // Redirect to the selected role's dashboard
  }
  