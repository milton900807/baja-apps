function (ottdata) {

  return new Promise(async (resolve, reject) => {
    function processOfftarget(offtargets) {
      return offtargets.map(ot => `Chr: ${ot.chr}, Edit Distance: ${ot.editdistance}, End: ${ot.end}, Start: ${ot.start}, Strand: ${ot.strand}`).join('; ');
    }
    function extractFileName(path) {

      const parts = path.split('/');
      return parts[parts.length - 1];
    }
    function jsonOBToCSV(jsonData) {
      let csvData = 'ID,Synthesis Sequence,Genome ID,Hits,Hits_0,Offtarget Details\n';
      jsonData.forEach(data => {
        data.oligoQuery.forEach(oligo => {
          oligo.genomes.forEach(genome => {
            const genomeID = extractFileName(genome.gid);
            const offtargetDetails = oligo.offtarget.length > 0 ? processOfftarget(oligo.offtarget) : 'N/A';
            csvData += `${oligo.id},${oligo.synthesisSequence},${genomeID},${genome.hits},${genome.hits_0},"${offtargetDetails}"\n`;
          });
        });
      });

      return csvData;
    }
    let v = jsonOBToCSV(ottdata);
    resolve(v);
  })

}
