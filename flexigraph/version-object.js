function () {

    return new Promise(async (resolve, reject) => {
        let VersionObject = class VersionObject {
            versionNumber;
            url;
            lastModifiedBy;
            lastModifiedDateTime;
            comment;
            constructor(versionNumber = -1, url = null, lastModifiedBy = null, lastModifiedDateTime = null, comment = null) {
                this.versionNumber = versionNumber;
                this.url = url;
                this.lastModifiedBy = lastModifiedBy;
                this.lastModifiedDateTime = lastModifiedDateTime;
                this.comment = comment;
            }
        };
        resolve(VersionObject)
    })

}
