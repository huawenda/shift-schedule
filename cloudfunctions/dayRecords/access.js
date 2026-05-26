function getLoadRecordsWhere() {
  return null
}

function canWritePersonRecord({ isAdminUser, allowedPersonName, personName }) {
  return isAdminUser || (Boolean(allowedPersonName) && personName === allowedPersonName)
}

module.exports = {
  getLoadRecordsWhere,
  canWritePersonRecord
}
