import { listGalleryImages } from "../lib/gallery.js";

const ALBUMS = [
  {
    slug: "mark-zaleski-band",
    title: "Mark Zaleski Band",
    date: "Sep 12",
    cover: "/img/gallery/mark-zaleski-band/01-room.jpg",
  },
];

export default function () {
  return ALBUMS.map((album) => ({
    ...album,
    photos: listGalleryImages(`img/gallery/${album.slug}`),
  }));
}
