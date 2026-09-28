// Where the chapter 5 acoustics labs look for their media, both served
// from public/:
//   audio  public/audio/<dir>/<id>.wav
//   image  public/<dir>/<id>.jpg   (a placeholder shows until it exists)
export const audioPath = (dir, id) => `/audio/${dir}/${id}.wav`;
export const imagePath = (dir, id) => `/${dir}/${id}.jpg`;
